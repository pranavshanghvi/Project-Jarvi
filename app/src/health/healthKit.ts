import { Platform } from 'react-native';
import {
  getBiologicalSexAsync,
  getDateOfBirthAsync,
  isHealthDataAvailable,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { toDateKey } from '../nutrition/aggregation';
import type { Sex } from '../profile/profileStore';
import type { WeightEntry } from '../weight/weightStore';

// Apple Watch writes both of these into Apple Health. Active energy is movement and workouts;
// basal (resting) energy is what the body burns just staying alive, and is most of a day's burn.
// Reading only active energy would understate burn and make every balance look like a surplus.
const ENERGY_TYPES = [
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
] as const;

// Everything we ask to READ. Nothing is ever written back to Health.
const READ_TYPES = [
  ...ENERGY_TYPES,
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeight',
  'HKCharacteristicTypeIdentifierDateOfBirth',
  'HKCharacteristicTypeIdentifierBiologicalSex',
] as const;

export interface DailyEnergyStat {
  startDate?: Date;
  sumQuantity?: { quantity: number };
}

export function isHealthSupported(): boolean {
  return Platform.OS === 'ios';
}

// Shows Apple's Health permission sheet the first time; afterwards iOS remembers the answer.
// Apple deliberately does not tell an app whether READ access was granted, so `true` only means
// the request completed. A refusal simply shows up as no data.
export async function requestHealthPermissions(): Promise<boolean> {
  if (!isHealthSupported()) return false;
  try {
    if (!(await isHealthDataAvailable())) return false;
    return await requestAuthorization({ toRead: READ_TYPES });
  } catch {
    return false;
  }
}

// Adds each day's totals into a { 'YYYY-MM-DD': calories } map keyed by the LOCAL calendar day,
// the same day definition the food log uses.
export function addDailyStats(target: Record<string, number>, stats: readonly DailyEnergyStat[]): Record<string, number> {
  for (const stat of stats) {
    const calories = stat.sumQuantity?.quantity;
    if (!stat.startDate || typeof calories !== 'number' || calories <= 0) continue;
    const key = toDateKey(new Date(stat.startDate));
    target[key] = (target[key] ?? 0) + calories;
  }
  return target;
}

// Midnight at the start of `start`'s day and midnight after `end`'s day: whole local days.
function wholeDays(start: Date, end: Date): { from: Date; to: Date } {
  return {
    from: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    to: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
  };
}

// Active (movement) and resting energy per local day, kept apart so the app can show both.
// Returns an empty map when Health is unavailable or access was refused: never throws.
export async function getEnergySplitByDay(
  start: Date,
  end: Date
): Promise<Record<string, { active: number; resting: number }>> {
  if (!isHealthSupported()) return {};
  const { from, to } = wholeDays(start, end);
  const active: Record<string, number> = {};
  const resting: Record<string, number> = {};
  try {
    for (const [identifier, target] of [
      [ENERGY_TYPES[0], active],
      [ENERGY_TYPES[1], resting],
    ] as const) {
      const stats = await queryStatisticsCollectionForQuantity(
        identifier,
        ['cumulativeSum'],
        from, // anchor at local midnight so each bucket is one local calendar day
        { day: 1 },
        { unit: 'kcal', filter: { date: { startDate: from, endDate: to } } }
      );
      addDailyStats(target, stats);
    }
  } catch {
    return {};
  }
  const split: Record<string, { active: number; resting: number }> = {};
  for (const key of new Set([...Object.keys(active), ...Object.keys(resting)])) {
    split[key] = { active: active[key] ?? 0, resting: resting[key] ?? 0 };
  }
  return split;
}

// Calories burned (active + resting) for every local day from `start` to `end` inclusive.
// Returns an empty map when Health is unavailable or access was refused: never throws.
export async function getCaloriesBurnedByDay(start: Date, end: Date): Promise<Record<string, number>> {
  const split = await getEnergySplitByDay(start, end);
  const burned: Record<string, number> = {};
  for (const [key, { active, resting }] of Object.entries(split)) burned[key] = active + resting;
  return burned;
}

export interface Workout {
  id: string;
  name: string;
  start: string; // ISO
  end: string; // ISO
  minutes: number;
  calories: number;
  distanceMeters?: number;
}

// Apple's activity codes (HKWorkoutActivityType) in plain English. Numbers are used instead of the
// library's enum so this file does not depend on the enum existing at load time.
const ACTIVITY_NAMES: Record<number, string> = {
  1: 'American football', 4: 'Badminton', 5: 'Baseball', 6: 'Basketball', 8: 'Boxing', 9: 'Climbing',
  11: 'Cross training', 13: 'Cycling', 14: 'Dance', 16: 'Elliptical', 20: 'Strength training',
  21: 'Golf', 24: 'Hiking', 25: 'Hockey', 28: 'Martial arts', 29: 'Mind and body', 35: 'Rowing',
  37: 'Run', 41: 'Soccer', 44: 'Stair climbing', 46: 'Swimming', 48: 'Tennis',
  50: 'Strength training', 52: 'Walk', 57: 'Yoga', 58: 'Barre', 59: 'Core training',
  62: 'Flexibility', 63: 'HIIT', 64: 'Jump rope', 65: 'Kickboxing', 66: 'Pilates',
  68: 'Stairs', 73: 'Mixed cardio', 79: 'Pickleball', 80: 'Cooldown',
};

function activityName(type: number, indoor: boolean): string {
  if (type === 37) return indoor ? 'Indoor run' : 'Outdoor run';
  if (type === 52 && indoor) return 'Indoor walk';
  if (type === 13 && indoor) return 'Indoor cycling';
  return ACTIVITY_NAMES[type] ?? 'Workout';
}

function toMinutes(q: { quantity: number; unit: string } | undefined, fallbackMs: number): number {
  if (!q || typeof q.quantity !== 'number') return Math.round(fallbackMs / 60000);
  const unit = q.unit.toLowerCase();
  if (unit === 'min') return Math.round(q.quantity);
  if (unit === 'hr' || unit === 'h') return Math.round(q.quantity * 60);
  return Math.round(q.quantity / 60); // seconds, Health's usual unit
}

function toKcal(q: { quantity: number; unit: string } | undefined): number {
  if (!q || typeof q.quantity !== 'number') return 0;
  const unit = q.unit.toLowerCase();
  if (unit === 'kj') return Math.round(q.quantity / 4.184);
  if (unit === 'cal') return Math.round(q.quantity / 1000);
  return Math.round(q.quantity);
}

function toMeters(q: { quantity: number; unit: string } | undefined): number | undefined {
  if (!q || typeof q.quantity !== 'number') return undefined;
  const unit = q.unit.toLowerCase();
  if (unit === 'km') return q.quantity * 1000;
  if (unit === 'mi') return q.quantity * 1609.344;
  return q.quantity;
}

// Workouts logged by the Apple Watch / Health, newest first, across whole local days.
// Returns [] when Health is unavailable or refused: never throws.
export async function getWorkouts(start: Date, end: Date): Promise<Workout[]> {
  if (!isHealthSupported()) return [];
  const { from, to } = wholeDays(start, end);
  try {
    const samples = await queryWorkoutSamples({
      filter: { date: { startDate: from, endDate: to } },
      limit: 0, // 0 means "no limit"
      ascending: false,
    });
    return samples
      .map((w): Workout => {
        const startDate = new Date(w.startDate);
        const endDate = new Date(w.endDate);
        const indoor = (w.metadata as Record<string, unknown> | undefined)?.HKIndoorWorkout === true;
        const distanceMeters = toMeters(w.totalDistance);
        return {
          id: w.uuid,
          name: activityName(Number(w.workoutActivityType), indoor),
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          minutes: toMinutes(w.duration, endDate.getTime() - startDate.getTime()),
          calories: toKcal(w.totalEnergyBurned),
          ...(distanceMeters !== undefined ? { distanceMeters } : {}),
        };
      })
      .sort((a, b) => b.start.localeCompare(a.start));
  } catch {
    return [];
  }
}

// Body-weight readings from Health, one per local day (the latest that day), oldest first.
export async function getHealthWeights(start: Date, end: Date): Promise<WeightEntry[]> {
  if (!isHealthSupported()) return [];
  const { from, to } = wholeDays(start, end);
  try {
    const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
      unit: 'kg',
      limit: 0,
      ascending: true,
      filter: { date: { startDate: from, endDate: to } },
    });
    const byDay = new Map<string, WeightEntry>();
    for (const s of [...samples].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))) {
      const when = new Date(s.startDate);
      byDay.set(toDateKey(when), { date: toDateKey(when), kg: s.quantity, time: when.toISOString(), source: 'health' });
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// What Health already knows about the person, to pre-fill the profile. Each piece is read on its
// own, so one missing item (say, no height) does not hide the others.
export async function getHealthProfile(): Promise<{ dateOfBirth?: string; sex?: Sex; heightCm?: number; weightKg?: number }> {
  if (!isHealthSupported()) return {};
  const result: { dateOfBirth?: string; sex?: Sex; heightCm?: number; weightKg?: number } = {};
  try {
    const dob = await getDateOfBirthAsync();
    if (dob) result.dateOfBirth = toDateKey(new Date(dob));
  } catch {}
  try {
    const sex = Number(await getBiologicalSexAsync()); // 1 = female, 2 = male; others are not usable
    if (sex === 1) result.sex = 'female';
    else if (sex === 2) result.sex = 'male';
  } catch {}
  try {
    const [h] = await queryQuantitySamples('HKQuantityTypeIdentifierHeight', { unit: 'cm', limit: 1, ascending: false });
    if (h && h.quantity > 0) result.heightCm = h.quantity;
  } catch {}
  try {
    const [w] = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { unit: 'kg', limit: 1, ascending: false });
    if (w && w.quantity > 0) result.weightKg = w.quantity;
  } catch {}
  return result;
}
