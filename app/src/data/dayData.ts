import { Platform } from 'react-native';
// Expo SDK 57 keeps copyAsync/documentDirectory on the legacy entry point only.
import * as FileSystem from 'expo-file-system/legacy';
import { getEntriesForDate, StoredEntry } from '../db/entriesRepository';
import { getEnergySplitByDay, getHealthWeights, getWorkouts, Workout } from '../health/healthKit';
import { toDateKey } from '../nutrition/aggregation';
import { NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';
import { getWeights, mergeWeights, WeightEntry } from '../weight/weightStore';

export interface DayData {
  date: Date;
  key: string;
  entries: StoredEntry[];
  eaten: number;
  active: number;
  resting: number;
  burned: number;
  workouts: Workout[];
}

export function entryCalories(entry: StoredEntry): number {
  return entry.items.reduce((sum, item) => sum + item.nutrients.calories, 0);
}

export function entryNutrients(entries: StoredEntry[]): NutrientProfile {
  const total = {} as NutrientProfile;
  for (const key of NUTRIENT_KEYS) total[key] = 0;
  for (const entry of entries) for (const item of entry.items) for (const key of NUTRIENT_KEYS) total[key] += item.nutrients[key];
  return total;
}

// "Pizza crust, Mozzarella +2": enough to recognise the meal in a list without listing it all.
export function mealTitle(entry: StoredEntry): string {
  const names = entry.items.map((item) => item.name);
  if (names.length === 0) return 'Meal';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Everything one day needs, fetched together: the food log from the phone's own storage and the
// burn and workouts from Apple Health. Health parts come back empty (not as errors) when Health
// is unavailable or access was refused, so the screen still shows the food.
export async function loadDay(date: Date): Promise<DayData> {
  const day = startOfDay(date);
  const key = toDateKey(day);
  const [entries, split, workouts] = await Promise.all([
    getEntriesForDate(key),
    getEnergySplitByDay(day, day),
    getWorkouts(day, addDays(day, 1)),
  ]);
  const energy = split[key] ?? { active: 0, resting: 0 };
  return {
    date: day,
    key,
    entries,
    eaten: entries.reduce((sum, e) => sum + entryCalories(e), 0),
    active: energy.active,
    resting: energy.resting,
    burned: energy.active + energy.resting,
    workouts: workouts.filter((w) => toDateKey(new Date(w.start)) === key),
  };
}

// Weights typed into the app plus any a smart scale saved to Apple Health, one per day.
export async function loadAllWeights(): Promise<WeightEntry[]> {
  const today = new Date();
  const [manual, health] = await Promise.all([getWeights(), getHealthWeights(new Date(today.getFullYear() - 10, 0, 1), addDays(today, 1))]);
  return mergeWeights(manual, health);
}

// iOS moves an app's folder to a new address every time the app is reinstalled or updated, so the
// full address saved with an old meal stops working. The file itself is still there under the
// same name, so rebuild the address from today's folder plus the saved file name.
export function resolvePhotoUri(stored: string): string {
  if (Platform.OS === 'web' || !stored.startsWith('file://') || !stored.includes('/Documents/')) return stored;
  return `${FileSystem.documentDirectory}${stored.slice(stored.lastIndexOf('/') + 1)}`;
}

// Copies a photo out of the temporary or library location into the app's own folder, so a saved
// meal keeps its picture. On the web the browser already hands back a stable address.
export async function persistPhoto(sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;
  const destination = `${FileSystem.documentDirectory}${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}
