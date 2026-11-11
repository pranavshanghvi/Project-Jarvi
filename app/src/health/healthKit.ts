import { Platform } from 'react-native';
import {
  isHealthDataAvailable,
  queryStatisticsCollectionForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { toDateKey } from '../nutrition/aggregation';

// Apple Watch writes both of these into Apple Health. Active energy is movement and workouts;
// basal (resting) energy is what the body burns just staying alive, and is most of a day's burn.
// Reading only active energy would understate burn and make every balance look like a surplus.
const ENERGY_TYPES = [
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
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
    return await requestAuthorization({ toRead: ENERGY_TYPES });
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

// Calories burned (active + resting) for every local day from `start` to `end` inclusive.
// Returns an empty map when Health is unavailable or access was refused: never throws.
export async function getCaloriesBurnedByDay(start: Date, end: Date): Promise<Record<string, number>> {
  if (!isHealthSupported()) return {};
  const startOfFirstDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOfLastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const burned: Record<string, number> = {};
  try {
    for (const identifier of ENERGY_TYPES) {
      const stats = await queryStatisticsCollectionForQuantity(
        identifier,
        ['cumulativeSum'],
        startOfFirstDay, // anchor at local midnight so each bucket is one local calendar day
        { day: 1 },
        { unit: 'kcal', filter: { date: { startDate: startOfFirstDay, endDate: endOfLastDay } } }
      );
      addDailyStats(burned, stats);
    }
  } catch {
    return {};
  }
  return burned;
}
