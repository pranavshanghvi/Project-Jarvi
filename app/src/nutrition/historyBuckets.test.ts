import { buildDailyBalance, DayBalance } from './energyBalance';
import { bucketize, rangeDays, summarizeBuckets } from './historyBuckets';

const row = (date: string, eaten: number, burned: number, logged = true): DayBalance => ({
  date,
  eaten,
  burned,
  net: eaten - burned,
  logged,
});

describe('rangeDays', () => {
  const today = new Date(2026, 10, 11);
  it('has fixed lengths for the preset ranges', () => {
    expect(rangeDays('week', today, null)).toBe(7);
    expect(rangeDays('month', today, null)).toBe(30);
    expect(rangeDays('sixMonths', today, null)).toBe(182);
    expect(rangeDays('year', today, null)).toBe(365);
  });

  it('"all" counts from the first logged day, inclusive, with a 30-day minimum', () => {
    expect(rangeDays('all', today, '2026-10-01')).toBe(42);
    expect(rangeDays('all', today, '2026-11-09')).toBe(30);
    expect(rangeDays('all', today, '2026-11-11')).toBe(30);
    expect(rangeDays('all', today, null)).toBe(365);
  });
});

describe('bucketize day ranges', () => {
  const rows = [row('2026-11-09', 2000, 2500), row('2026-11-10', 0, 2400, false), row('2026-11-11', 2300, 2500)];

  it('makes one bucket per day with weekday labels for a week', () => {
    const b = bucketize(rows, 'week');
    expect(b.map((x) => x.label)).toEqual(['Mon', 'Tue', 'Wed']);
    expect(b[2]).toMatchObject({ key: '2026-11-11', title: 'Wed, Nov 11', start: '2026-11-11', end: '2026-11-11', eaten: 2300, burned: 2500, net: -200, loggedDays: 1, totalDays: 1 });
  });

  it('uses the day of the month as the label for a month', () => {
    expect(bucketize(rows, 'month').map((x) => x.label)).toEqual(['9', '10', '11']);
  });

  it('reports an unlogged day as zeros with no logged days', () => {
    expect(bucketize(rows, 'week')[1]).toMatchObject({ eaten: 0, burned: 0, net: 0, loggedDays: 0, totalDays: 1 });
  });
});

describe('bucketize weeks (six months)', () => {
  // Sun Nov 8 belongs to the week starting Mon Nov 2; Mon Nov 9 starts a new week.
  const rows = [row('2026-11-08', 1800, 2400), row('2026-11-09', 2000, 2400), row('2026-11-10', 2200, 2600), row('2026-11-11', 0, 2500, false)];

  it('starts weeks on Monday', () => {
    const b = bucketize(rows, 'sixMonths');
    expect(b.map((x) => x.key)).toEqual(['2026-11-02', '2026-11-09']);
    expect(b[0]).toMatchObject({ label: '11/2', title: 'Week of Nov 2', start: '2026-11-02', end: '2026-11-08', totalDays: 1 });
    expect(b[1]).toMatchObject({ label: '11/9', title: 'Week of Nov 9', start: '2026-11-09', end: '2026-11-15', totalDays: 3 });
  });

  it('averages per logged day and leaves unlogged days out', () => {
    const wk = bucketize(rows, 'sixMonths')[1];
    expect(wk.loggedDays).toBe(2);
    expect(wk.eaten).toBe(2100);
    expect(wk.burned).toBe(2500);
    expect(wk.net).toBe(-400);
  });
});

describe('bucketize months (year and all)', () => {
  const rows = [row('2026-10-30', 2000, 2500), row('2026-10-31', 2200, 2500), row('2026-11-01', 1900, 2500)];

  it('splits at month boundaries', () => {
    const b = bucketize(rows, 'year');
    expect(b.map((x) => x.key)).toEqual(['2026-10', '2026-11']);
    expect(b[0]).toMatchObject({ label: 'O', title: 'October 2026', start: '2026-10-01', end: '2026-10-31', loggedDays: 2, totalDays: 2, eaten: 2100 });
    expect(b[1]).toMatchObject({ label: 'N', title: 'November 2026', start: '2026-11-01', end: '2026-11-30' });
    expect(bucketize(rows, 'all')).toHaveLength(2);
  });

  it('works on rows built by buildDailyBalance', () => {
    const balance = buildDailyBalance({ '2026-11-10': 2000 }, { '2026-11-10': 2500, '2026-11-11': 2400 }, 2, new Date(2026, 10, 11));
    const b = bucketize(balance, 'year');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ loggedDays: 1, totalDays: 2, eaten: 2000, burned: 2500 });
  });
});

describe('summarizeBuckets', () => {
  it('weights each bucket by its logged days', () => {
    const buckets = bucketize(
      [row('2026-10-31', 3000, 2500), row('2026-11-01', 2000, 2500), row('2026-11-02', 2000, 2500), row('2026-11-03', 2000, 2500)],
      'year'
    );
    const s = summarizeBuckets(buckets);
    expect(s).toMatchObject({ loggedDays: 4, totalDays: 4, eaten: 2250, burned: 2500, net: -250 });
  });

  it('is all zeros with nothing logged', () => {
    expect(summarizeBuckets(bucketize([row('2026-11-11', 0, 2500, false)], 'week'))).toEqual({ eaten: 0, burned: 0, net: 0, loggedDays: 0, totalDays: 1 });
    expect(summarizeBuckets([])).toEqual({ eaten: 0, burned: 0, net: 0, loggedDays: 0, totalDays: 0 });
  });
});
