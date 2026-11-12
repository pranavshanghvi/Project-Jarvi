import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatItem } from '../api/mealChat';
import type { StoredEntry } from '../db/entriesRepository';
import type { MealType, NutrientProfile } from '../types/nutrition';
import { NUTRIENT_KEYS } from '../types/nutrition';

// "Your usuals": meals a person has again and again (the same coffee every morning), kept so the
// next one is a single tap with no photo and no AI read. Everything here stays on the device.

export interface Usual {
  id: string;
  name: string;
  items: ChatItem[];
  // When in the day this is normally had, in minutes after midnight, so the right usual is
  // offered first at the right time.
  minuteOfDay: number;
  uses: number;
  lastUsed: string;
}

const KEY = 'jarvi.usuals';
const MAX_USUALS = 30;
const DAY = 24 * 60;

export const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

// Minutes between two times of day, going the short way round midnight.
export function clockDistance(a: number, b: number): number {
  const gap = Math.abs(a - b) % DAY;
  return Math.min(gap, DAY - gap);
}

// What makes two meals "the same thing": the same foods, whatever the order or capitals.
export function signature(names: string[]): string {
  return names.map((name) => name.trim().toLowerCase()).filter(Boolean).sort().join('|');
}

export function usualCalories(usual: Pick<Usual, 'items'>): number {
  return usual.items.reduce((sum, item) => sum + item.nutrients.calories * item.servings, 0);
}

// The one most likely wanted right now comes first: a usual normally had within two hours of the
// current time, nearest first; after those, the most used.
export function rankUsuals(usuals: Usual[], now: Date): Usual[] {
  const at = minuteOfDay(now);
  const near = (usual: Usual) => clockDistance(usual.minuteOfDay, at) <= 120;
  return [...usuals].sort((a, b) => {
    if (near(a) !== near(b)) return near(a) ? -1 : 1;
    if (near(a)) return clockDistance(a.minuteOfDay, at) - clockDistance(b.minuteOfDay, at);
    return b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed);
  });
}

const MEAL_NAMES: Record<MealType, string> = { breakfast: 'My breakfast', lunch: 'My lunch', dinner: 'My dinner', snack: 'My snack' };

// A starting name the person can change: "My coffee" for a coffee, otherwise named for the meal.
// `said` is what the person typed or spoke while logging it: "the milk in my coffee" names the
// meal better than its ingredients (milk, sugar) do.
export function suggestName(items: Pick<ChatItem, 'name'>[], mealType: MealType, existing: Pick<Usual, 'name'>[], said = ''): string {
  const names = [...items.map((item) => item.name.toLowerCase()), said.toLowerCase()];
  const base = names.some((name) => name.includes('coffee')) ? 'My coffee' : names.some((name) => /\btea\b/.test(name)) ? 'My tea' : items.length === 1 ? items[0].name : MEAL_NAMES[mealType];
  const taken = new Set(existing.map((usual) => usual.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

function isUsual(value: any): value is Usual {
  return value && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.items) && value.items.length > 0;
}

export async function getUsuals(): Promise<Usual[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isUsual) : [];
  } catch {
    return [];
  }
}

async function write(usuals: Usual[]): Promise<Usual[]> {
  await AsyncStorage.setItem(KEY, JSON.stringify(usuals));
  return usuals;
}

// Saving the same foods again replaces the earlier usual rather than adding a twin.
export async function saveUsual(name: string, items: ChatItem[], when: Date = new Date()): Promise<Usual[]> {
  const usuals = await getUsuals();
  const sig = signature(items.map((item) => item.name));
  const usual: Usual = { id: `${when.getTime()}`, name: name.trim() || 'My usual', items, minuteOfDay: minuteOfDay(when), uses: 1, lastUsed: when.toISOString() };
  const others = usuals.filter((existing) => signature(existing.items.map((item) => item.name)) !== sig);
  return write([usual, ...others].slice(0, MAX_USUALS));
}

// Each use nudges the usual's time of day toward when it was actually had.
export async function recordUse(id: string, when: Date = new Date()): Promise<Usual[]> {
  const usuals = await getUsuals();
  return write(
    usuals.map((usual) => {
      if (usual.id !== id) return usual;
      const at = minuteOfDay(when);
      const drift = clockDistance(usual.minuteOfDay, at) > 180 ? usual.minuteOfDay : Math.round((usual.minuteOfDay * 2 + at) / 3);
      return { ...usual, uses: usual.uses + 1, lastUsed: when.toISOString(), minuteOfDay: drift };
    })
  );
}

export async function removeUsual(id: string): Promise<Usual[]> {
  return write((await getUsuals()).filter((usual) => usual.id !== id));
}

export interface Repeat {
  items: ChatItem[];
  days: number;
  minuteOfDay: number;
}

// A meal the person has logged on two or more different days that is not a usual yet, so the app
// can offer to keep it without being asked. The most repeated one wins; the newest copy is used.
export function findRepeat(entries: StoredEntry[], usuals: Usual[]): Repeat | null {
  const known = new Set(usuals.map((usual) => signature(usual.items.map((item) => item.name))));
  const groups = new Map<string, { days: Set<string>; latest: StoredEntry }>();
  for (const entry of entries) {
    if (entry.items.length === 0) continue;
    const sig = signature(entry.items.map((item) => item.name));
    if (!sig || known.has(sig)) continue;
    const when = new Date(entry.timestamp);
    const day = `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;
    const group = groups.get(sig) ?? { days: new Set<string>(), latest: entry };
    group.days.add(day);
    if (entry.timestamp > group.latest.timestamp) group.latest = entry;
    groups.set(sig, group);
  }
  let best: { days: Set<string>; latest: StoredEntry } | null = null;
  for (const group of groups.values()) {
    if (group.days.size < 2) continue;
    if (!best || group.days.size > best.days.size || (group.days.size === best.days.size && group.latest.timestamp > best.latest.timestamp)) best = group;
  }
  if (!best) return null;
  return {
    days: best.days.size,
    minuteOfDay: minuteOfDay(new Date(best.latest.timestamp)),
    // A saved meal already holds the numbers for what was eaten, so it comes back as one serving.
    items: best.latest.items.map((item) => {
      const nutrients = {} as NutrientProfile;
      for (const key of NUTRIENT_KEYS) nutrients[key] = Math.round(item.nutrients[key] * item.portionMultiplier * 10) / 10;
      return { name: item.name, confidence: item.confidence, portionDescription: '1 serving', nutrients, source: 'said' as const, servings: 1, servingsPerContainer: null };
    }),
  };
}
