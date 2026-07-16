import { NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  totals: NutrientProfile;
}

function zeroProfile(): NutrientProfile {
  return {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    saturatedFatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    cholesterolMg: 0,
  };
}

export function aggregateDailyTotals(items: NutrientProfile[]): NutrientProfile {
  const totals = zeroProfile();
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      totals[key] += item[key];
    }
  }
  return totals;
}

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildTrend(
  entriesByDate: Record<string, NutrientProfile[]>,
  days: number,
  referenceDate: Date
): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(referenceDate);
    day.setDate(day.getDate() - i);
    const key = toDateKey(day);
    points.push({ date: key, totals: aggregateDailyTotals(entriesByDate[key] ?? []) });
  }
  return points;
}
