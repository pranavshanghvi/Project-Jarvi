import { aggregateDailyTotals, buildTrend } from './aggregation';
import { NutrientProfile } from '../types/nutrition';

function profile(calories: number): NutrientProfile {
  return {
    calories,
    proteinG: 1,
    carbsG: 1,
    fatG: 1,
    saturatedFatG: 1,
    fiberG: 1,
    sugarG: 1,
    sodiumMg: 1,
    cholesterolMg: 1,
  };
}

describe('aggregateDailyTotals', () => {
  it('sums every field across items', () => {
    const totals = aggregateDailyTotals([profile(100), profile(200)]);
    expect(totals.calories).toBe(300);
    expect(totals.proteinG).toBe(2);
  });

  it('returns all zeros for an empty list', () => {
    const totals = aggregateDailyTotals([]);
    expect(totals.calories).toBe(0);
    expect(totals.sodiumMg).toBe(0);
  });
});

describe('buildTrend', () => {
  it('returns one point per day, oldest first, filling gaps with zero totals', () => {
    const referenceDate = new Date(2026, 6, 13); // 2026-07-13 (local)
    const entriesByDate = {
      '2026-07-13': [profile(500)],
      '2026-07-11': [profile(300)],
    };
    const trend = buildTrend(entriesByDate, 3, referenceDate);
    expect(trend.map((p) => p.date)).toEqual(['2026-07-11', '2026-07-12', '2026-07-13']);
    expect(trend[0].totals.calories).toBe(300);
    expect(trend[1].totals.calories).toBe(0);
    expect(trend[2].totals.calories).toBe(500);
  });
});
