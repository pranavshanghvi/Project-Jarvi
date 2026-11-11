jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteWeight, getWeights, latestWeight, logWeight, mergeWeights, weightChange, WeightEntry } from './weightStore';

const m = (date: string, kg: number): WeightEntry => ({ date, kg, source: 'manual' });
const h = (date: string, kg: number): WeightEntry => ({ date, kg, source: 'health' });

beforeEach(() => AsyncStorage.clear());

describe('logging weights', () => {
  it('stores entries ascending by date', async () => {
    await logWeight(81, new Date(2026, 10, 10, 8));
    await logWeight(82, new Date(2026, 10, 8, 8));
    expect((await getWeights()).map((e) => e.date)).toEqual(['2026-11-08', '2026-11-10']);
  });

  it('replaces the same day instead of adding a second entry', async () => {
    await logWeight(81, new Date(2026, 10, 10, 8));
    const list = await logWeight(80.6, new Date(2026, 10, 10, 21));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ date: '2026-11-10', kg: 80.6, source: 'manual' });
    expect(list[0].time).toBe(new Date(2026, 10, 10, 21).toISOString());
  });

  it('deletes a day', async () => {
    await logWeight(81, new Date(2026, 10, 10));
    await logWeight(82, new Date(2026, 10, 9));
    expect((await deleteWeight('2026-11-10')).map((e) => e.date)).toEqual(['2026-11-09']);
    expect(await getWeights()).toHaveLength(1);
  });
});

describe('mergeWeights', () => {
  it('keeps one per day, manual wins, ascending', () => {
    const merged = mergeWeights([m('2026-11-10', 80), m('2026-11-05', 81)], [h('2026-11-10', 79.5), h('2026-11-07', 80.5)]);
    expect(merged).toEqual([m('2026-11-05', 81), h('2026-11-07', 80.5), m('2026-11-10', 80)]);
  });
});

describe('latestWeight', () => {
  it('returns the newest entry or null', () => {
    expect(latestWeight([])).toBeNull();
    expect(latestWeight([m('2026-11-10', 80), m('2026-11-05', 81)])?.date).toBe('2026-11-10');
  });
});

describe('weightChange', () => {
  const today = new Date(2026, 10, 11);

  it('uses the most recent entry at least `days` days old', () => {
    const entries = [m('2026-10-01', 90), m('2026-11-03', 85), m('2026-11-08', 84), m('2026-11-11', 83)];
    // 7 days before Nov 11 is Nov 4, so the baseline is Nov 3 (85)
    expect(weightChange(entries, 7, today)).toBeCloseTo(-2);
  });

  it('falls back to the earliest entry inside the window when none is old enough', () => {
    const entries = [m('2026-11-08', 84), m('2026-11-10', 83.5), m('2026-11-11', 83)];
    expect(weightChange(entries, 30, today)).toBeCloseTo(-1);
  });

  it('is null with fewer than two readings', () => {
    expect(weightChange([], 7, today)).toBeNull();
    expect(weightChange([m('2026-11-11', 83)], 7, today)).toBeNull();
  });

  it('ignores entries dated after today', () => {
    expect(weightChange([m('2026-11-10', 83), m('2026-11-20', 70)], 7, today)).toBeNull();
  });
});
