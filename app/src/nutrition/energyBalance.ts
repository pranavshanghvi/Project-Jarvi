import { toDateKey } from './aggregation';

export type Period = 'day' | 'week' | 'month';

export const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 };

export interface DayBalance {
  date: string; // YYYY-MM-DD, local calendar day
  eaten: number;
  burned: number;
  net: number; // eaten - burned: negative is a deficit, positive a surplus
  logged: boolean; // false when no food was logged that day
}

export interface PeriodSummary {
  eaten: number;
  burned: number;
  net: number;
  loggedDays: number;
  totalDays: number;
  averageNetPerDay: number;
}

// One row per local calendar day, oldest first, ending on referenceDate.
export function buildDailyBalance(
  eatenByDate: Record<string, number>,
  burnedByDate: Record<string, number>,
  days: number,
  referenceDate: Date
): DayBalance[] {
  const rows: DayBalance[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - i);
    const key = toDateKey(day);
    const eaten = eatenByDate[key] ?? 0;
    const burned = burnedByDate[key] ?? 0;
    rows.push({ date: key, eaten, burned, net: eaten - burned, logged: key in eatenByDate && eaten > 0 });
  }
  return rows;
}

// A day with no food logged is a day nobody recorded, not a day of fasting. Counting it would
// report its whole burn as a deficit, so totals only cover days that have food logged.
export function summarizeBalance(rows: DayBalance[]): PeriodSummary {
  const logged = rows.filter((r) => r.logged);
  const eaten = logged.reduce((sum, r) => sum + r.eaten, 0);
  const burned = logged.reduce((sum, r) => sum + r.burned, 0);
  const net = eaten - burned;
  return {
    eaten,
    burned,
    net,
    loggedDays: logged.length,
    totalDays: rows.length,
    averageNetPerDay: logged.length > 0 ? net / logged.length : 0,
  };
}

export function describeNet(net: number): string {
  const rounded = Math.round(Math.abs(net));
  if (rounded === 0) return 'Even';
  return net < 0 ? `${rounded} cal deficit` : `${rounded} cal surplus`;
}

// The three numbers at the top of the balance screen. Totals follow summarizeBalance (logged days
// only), with two exceptions so the screen never states something untrue:
//  - a single day always shows its real burn, even before any food is logged that day;
//  - with no food logged at all there is no net to report, so it reads "—" rather than "Even".
export function headlineFigures(rows: DayBalance[]): { eaten: number; burned: number; net: string } {
  const summary = summarizeBalance(rows);
  return {
    eaten: summary.eaten,
    burned: rows.length === 1 ? rows[0].burned : summary.burned,
    net: summary.loggedDays === 0 ? '—' : describeNet(summary.net),
  };
}

// Calories eaten per local calendar day, from saved food entries.
export function caloriesEatenByDate(
  entries: { timestamp: string; items: { nutrients: { calories: number } }[] }[]
): Record<string, number> {
  const eaten: Record<string, number> = {};
  for (const entry of entries) {
    const key = toDateKey(new Date(entry.timestamp));
    const calories = entry.items.reduce((sum, item) => sum + item.nutrients.calories, 0);
    eaten[key] = (eaten[key] ?? 0) + calories;
  }
  return eaten;
}
