import AsyncStorage from '@react-native-async-storage/async-storage';
import { toDateKey } from '../nutrition/aggregation';

// `manual` = typed in by the user; `health` = read from Apple Health.
export interface WeightEntry {
  date: string; // local calendar day, YYYY-MM-DD
  kg: number;
  time?: string; // ISO timestamp of when it was weighed
  source: 'manual' | 'health';
}

const KEY = 'jarvi.weights';

function isEntry(value: any): value is WeightEntry {
  return !!value && typeof value.date === 'string' && typeof value.kg === 'number';
}

const byDate = (a: WeightEntry, b: WeightEntry) => a.date.localeCompare(b.date);

// Only manual entries live here; Apple Health weights are read fresh each time and merged in.
export async function getWeights(): Promise<WeightEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).sort(byDate) : [];
  } catch {
    return [];
  }
}

async function writeWeights(entries: WeightEntry[]): Promise<WeightEntry[]> {
  const sorted = [...entries].sort(byDate);
  await AsyncStorage.setItem(KEY, JSON.stringify(sorted));
  return sorted;
}

// One weigh-in per day: logging again the same day replaces the earlier number.
export async function logWeight(kg: number, at: Date = new Date()): Promise<WeightEntry[]> {
  const date = toDateKey(at);
  const others = (await getWeights()).filter((e) => e.date !== date);
  return writeWeights([...others, { date, kg, time: at.toISOString(), source: 'manual' }]);
}

export async function deleteWeight(date: string): Promise<WeightEntry[]> {
  return writeWeights((await getWeights()).filter((e) => e.date !== date));
}

// Combines the two sources into one reading per day. If you typed a weight, that beats whatever
// Health has for the same day.
export function mergeWeights(manual: WeightEntry[], health: WeightEntry[]): WeightEntry[] {
  const byDay = new Map<string, WeightEntry>();
  for (const e of health) byDay.set(e.date, e);
  for (const e of manual) byDay.set(e.date, e);
  return [...byDay.values()].sort(byDate);
}

export function latestWeight(entries: WeightEntry[]): WeightEntry | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(byDate);
  return sorted[sorted.length - 1];
}

// Whole days between two YYYY-MM-DD keys, immune to daylight-saving shifts.
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// How much weight moved over the last `days` days (kg; negative = lost). Compares the latest
// weigh-in with the most recent one at least `days` days ago. If nothing is that old, it uses the
// earliest weigh-in inside the window, so a new user still sees a trend. Null with under 2 readings.
export function weightChange(entries: WeightEntry[], days: number, today: Date): number | null {
  const todayKey = toDateKey(today);
  const usable = entries.filter((e) => e.date <= todayKey).sort(byDate);
  if (usable.length < 2) return null;
  const latest = usable[usable.length - 1];
  const rest = usable.slice(0, -1);
  const older = rest.filter((e) => daysBetweenKeys(e.date, todayKey) >= days);
  const baseline = older.length > 0 ? older[older.length - 1] : rest[0];
  return latest.kg - baseline.kg;
}
