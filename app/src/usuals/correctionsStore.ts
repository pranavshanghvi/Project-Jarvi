import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatItem } from '../api/mealChat';
import { isGuess, NUTRIENT_KEYS, NutrientProfile } from '../types/nutrition';

// "Remember my corrections": when the person types the real numbers for a food, keep them, and use
// them the next time the AI comes back with a guess for that same food.
//
// Why: the free AI does not look anything up. On 2026-11-12 it said 350 calories for a shop donut
// whose published figure is 240, and the free nutrition databases did not have that donut either.
// The one reliable source left is the person, so they should only ever have to say it once.
// Everything here stays on the device.

export interface Correction {
  name: string;
  nutrients: NutrientProfile; // for one portion, as the person typed them
  portionDescription: string; // may be empty
  savedAt: string;
}

const KEY = 'jarvi.corrections';
const MAX_CORRECTIONS = 200;

// Spellings that mean the same food, and words that do not help tell foods apart.
const SAME: Record<string, string> = { doughnut: 'donut', kreme: 'cream', creme: 'cream', yoghurt: 'yogurt', caffe: 'cafe' };
const NOISE = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'in', 'my', 'some', 'one']);

// A food name boiled down to the words that identify it: "Dunkin' Bavarian Kreme Donuts" and
// "dunkin bavarian cream donut" come out the same.
export function foodWords(name: string): string[] {
  const all = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9%]+/)
    .filter((word) => word && !NOISE.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
    .map((word) => SAME[word] ?? word);
  return [...new Set(all)].sort();
}

// Whether a guessed food is the one a correction was saved for. Exactly the same words always
// counts. One name inside the other counts only when the shorter has three or more words, so
// "Bavarian cream donut" finds "Dunkin Bavarian cream donut", but "chocolate donut" does not pick
// up the numbers saved for a "chocolate glazed donut".
export function sameFood(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const inLong = new Set(long);
  if (!short.every((word) => inLong.has(word))) return false;
  return short.length === long.length || short.length >= 3;
}

function isCorrection(value: any): value is Correction {
  return value && typeof value.name === 'string' && value.nutrients && typeof value.nutrients.calories === 'number';
}

export async function getCorrections(): Promise<Correction[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isCorrection) : [];
  } catch {
    return [];
  }
}

// The newest correction for a food replaces any earlier one for it.
export async function rememberCorrections(foods: { name: string; nutrients: NutrientProfile; portionDescription?: string }[], when: Date = new Date()): Promise<Correction[]> {
  const fresh: Correction[] = [];
  for (const food of foods) {
    const words = foodWords(food.name);
    // Nothing to key it by, or nothing was actually entered.
    if (words.length === 0 || NUTRIENT_KEYS.every((key) => !food.nutrients[key])) continue;
    fresh.push({ name: food.name.trim(), nutrients: food.nutrients, portionDescription: food.portionDescription?.trim() ?? '', savedAt: when.toISOString() });
  }
  if (fresh.length === 0) return getCorrections();
  const freshKeys = new Set(fresh.map((c) => foodWords(c.name).join(' ')));
  const kept = (await getCorrections()).filter((c) => !freshKeys.has(foodWords(c.name).join(' ')));
  const all = [...fresh, ...kept].slice(0, MAX_CORRECTIONS);
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

// Swaps the AI's guess for the person's own numbers wherever a saved correction fits. Only guesses
// are touched: numbers read off a label or found in a database are left alone. An exact name match
// is preferred over a partial one, and how much was eaten is never changed.
export function applyCorrections(items: ChatItem[], corrections: Correction[]): { items: ChatItem[]; used: Correction[] } {
  const used: Correction[] = [];
  const keyed = corrections.map((correction) => ({ correction, words: foodWords(correction.name) }));
  const fixed = items.map((item) => {
    if (!isGuess(item.source)) return item;
    const words = foodWords(item.name);
    const match = keyed.find((c) => c.words.join(' ') === words.join(' ')) ?? keyed.find((c) => sameFood(c.words, words));
    if (!match) return item;
    used.push(match.correction);
    return { ...item, nutrients: match.correction.nutrients, portionDescription: match.correction.portionDescription || item.portionDescription, source: 'typed' as const, confidence: 'normal' as const };
  });
  return { items: fixed, used };
}
