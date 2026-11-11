import { toDateKey } from '../nutrition/aggregation';
import type { Profile } from '../profile/profileStore';
import { daysBetweenKeys, latestWeight, type WeightEntry } from '../weight/weightStore';
import { kgToLb } from '../units';

export type Pace = 'gentle' | 'steady' | 'faster';

// startWeightKg is kept so progress stays meaningful even after the current weight moves.
export interface Goal {
  startWeightKg: number;
  targetWeightKg: number;
  pace: Pace;
  startedOn: string; // YYYY-MM-DD
}

// About 3,500 calories is one pound of body weight, so 500 a day is roughly a pound a week.
export const PACE_DAILY_CALORIES: Record<Pace, number> = { gentle: 250, steady: 500, faster: 750 };
export const PACE_LB_PER_WEEK: Record<Pace, number> = { gentle: 0.5, steady: 1, faster: 1.5 };

// We never suggest eating less than this, whatever the maths says.
export const MIN_DAILY_INTAKE = 1200;

export function isLossGoal(goal: Goal): boolean {
  return goal.targetWeightKg < goal.startWeightKg;
}

function isGainGoal(goal: Goal): boolean {
  return goal.targetWeightKg > goal.startWeightKg;
}

// "Net" is eaten minus burned, so losing weight means a negative number.
export function dailyNetTarget(goal: Goal): number {
  if (isLossGoal(goal)) return -PACE_DAILY_CALORIES[goal.pace];
  if (isGainGoal(goal)) return PACE_DAILY_CALORIES[goal.pace];
  return 0;
}

export function intakeTarget(burned: number, goal: Goal): number {
  return Math.max(MIN_DAILY_INTAKE, Math.round(burned + dailyNetTarget(goal)));
}

// A little slack (100 cal) so a day that misses by a cookie still counts as on track.
export function dayOnTarget(net: number, goal: Goal): boolean {
  const target = dailyNetTarget(goal);
  if (isLossGoal(goal)) return net <= target + 100;
  if (isGainGoal(goal)) return net >= target - 100;
  return Math.abs(net) <= 150;
}

export function goalProgress(goal: Goal, currentKg: number): { fraction: number; doneKg: number; remainingKg: number } {
  const total = Math.abs(goal.targetWeightKg - goal.startWeightKg);
  const direction = Math.sign(goal.targetWeightKg - goal.startWeightKg);
  if (direction === 0) return { fraction: 1, doneKg: 0, remainingKg: 0 };
  const doneKg = Math.max(0, direction * (currentKg - goal.startWeightKg));
  const remainingKg = Math.max(0, direction * (goal.targetWeightKg - currentKg));
  return { fraction: Math.min(1, Math.max(0, doneKg / total)), doneKg, remainingKg };
}

const TREND_WINDOW_DAYS = 28;
const TREND_MIN_SPAN_DAYS = 7;

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Straight-line trend (kg per day) through recent weigh-ins, or null when there is not enough
// history to trust it. A line through every point is steadier than comparing just two readings.
function recentTrendKgPerDay(weights: WeightEntry[], today: Date): number | null {
  const todayKey = toDateKey(today);
  const windowStart = toDateKey(addDays(today, -TREND_WINDOW_DAYS));
  const recent = weights.filter((w) => w.date >= windowStart && w.date <= todayKey).sort((a, b) => a.date.localeCompare(b.date));
  if (recent.length < 2) return null;
  const origin = recent[0].date;
  const xs = recent.map((w) => daysBetweenKeys(origin, w.date));
  if (xs[xs.length - 1] < TREND_MIN_SPAN_DAYS) return null;
  const n = recent.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = recent.reduce((a, w) => a + w.kg, 0) / n;
  let num = 0;
  let den = 0;
  recent.forEach((w, i) => {
    num += (xs[i] - meanX) * (w.kg - meanY);
    den += (xs[i] - meanX) ** 2;
  });
  return den === 0 ? null : num / den;
}

// When you should reach the target. Prefers how you are really trending; if that is missing or
// pointing the wrong way, assumes the chosen pace instead.
export function projectedDate(goal: Goal, weights: WeightEntry[], today: Date): Date | null {
  const current = latestWeight(weights);
  if (!current) return null;
  const direction = Math.sign(goal.targetWeightKg - goal.startWeightKg);
  if (direction === 0) return null;
  const remaining = direction * (goal.targetWeightKg - current.kg);
  if (remaining <= 0) return null;

  const trend = recentTrendKgPerDay(weights, today);
  const trendToward = trend !== null && trend * direction > 0 ? Math.abs(trend) : null;
  const kgPerDay = trendToward ?? (PACE_LB_PER_WEEK[goal.pace] / kgToLb(1)) / 7;
  // (the tiny 1e-9 stops floating-point dust from adding a phantom extra day)
  return addDays(today, Math.ceil(remaining / kgPerDay - 1e-9));
}

export function ageOn(dateOfBirth: string, today: Date): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  let age = today.getFullYear() - y;
  const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

// Mifflin-St Jeor: the standard estimate of calories burned at complete rest.
export function estimateRestingCalories(profile: Profile, weightKg: number, today: Date): number {
  const age = ageOn(profile.dateOfBirth, today);
  return Math.round(10 * weightKg + 6.25 * profile.heightCm - 5 * age + (profile.sex === 'male' ? 5 : -161));
}
