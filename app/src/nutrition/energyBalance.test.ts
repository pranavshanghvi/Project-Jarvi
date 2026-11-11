import { buildDailyBalance, caloriesEatenByDate, describeNet, summarizeBalance } from './energyBalance';

const ref = new Date(2026, 10, 10, 15, 0, 0); // local 10 Nov 2026, mid-afternoon

describe('buildDailyBalance', () => {
  it('returns one row per local day, oldest first, ending on the reference day', () => {
    const rows = buildDailyBalance({}, {}, 3, ref);
    expect(rows.map((r) => r.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
  });

  it('computes net as eaten minus burned', () => {
    const rows = buildDailyBalance({ '2026-11-10': 1800 }, { '2026-11-10': 2300 }, 1, ref);
    expect(rows[0]).toEqual({ date: '2026-11-10', eaten: 1800, burned: 2300, net: -500, logged: true });
  });

  it('marks a day with no food as not logged', () => {
    const rows = buildDailyBalance({}, { '2026-11-10': 2300 }, 1, ref);
    expect(rows[0].logged).toBe(false);
  });

  it('crosses a month boundary correctly', () => {
    const rows = buildDailyBalance({}, {}, 3, new Date(2026, 10, 1));
    expect(rows.map((r) => r.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('summarizeBalance', () => {
  it('totals only the days that have food logged', () => {
    const rows = buildDailyBalance(
      { '2026-11-09': 2000, '2026-11-10': 1500 },
      { '2026-11-08': 2400, '2026-11-09': 2500, '2026-11-10': 2200 },
      3,
      ref
    );
    const summary = summarizeBalance(rows);
    expect(summary.eaten).toBe(3500);
    expect(summary.burned).toBe(4700); // the unlogged 8th is left out
    expect(summary.net).toBe(-1200);
    expect(summary.loggedDays).toBe(2);
    expect(summary.totalDays).toBe(3);
    expect(summary.averageNetPerDay).toBe(-600);
  });

  it('is all zeros when nothing was logged', () => {
    const summary = summarizeBalance(buildDailyBalance({}, { '2026-11-10': 2200 }, 1, ref));
    expect(summary).toEqual({ eaten: 0, burned: 0, net: 0, loggedDays: 0, totalDays: 1, averageNetPerDay: 0 });
  });
});

describe('describeNet', () => {
  it('names a deficit, a surplus and an even day', () => {
    expect(describeNet(-512.4)).toBe('512 cal deficit');
    expect(describeNet(300)).toBe('300 cal surplus');
    expect(describeNet(0.2)).toBe('Even');
  });
});

describe('caloriesEatenByDate', () => {
  it('adds up every item of every entry on the same local day', () => {
    const eaten = caloriesEatenByDate([
      { timestamp: new Date(2026, 10, 10, 8).toISOString(), items: [{ nutrients: { calories: 300 } }, { nutrients: { calories: 120 } }] },
      { timestamp: new Date(2026, 10, 10, 23, 30).toISOString(), items: [{ nutrients: { calories: 500 } }] },
      { timestamp: new Date(2026, 10, 9, 13).toISOString(), items: [{ nutrients: { calories: 650 } }] },
    ]);
    expect(eaten).toEqual({ '2026-11-10': 920, '2026-11-09': 650 });
  });
});
