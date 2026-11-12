import { completeNutrients, DetectedFoodItem, NUTRIENT_KEYS, NutrientProfile } from '../types/nutrition';
import { prepareForUpload } from './analyzePhoto';

// The meal helper: a short conversation that builds one meal. Each turn sends the meal so far
// plus whatever is new (a photo, or something said or typed) and gets back the updated meal and a
// short reply. The server remembers nothing between turns; this side carries the list.

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;

// Limits per meal. Every turn is one read against a free AI allowance shared by everyone using
// the app, so a single meal cannot run away with it. The turn limit is the real ceiling (a photo
// is one turn); six photos is enough for a meal of several dishes, with turns left to talk.
export const MAX_PHOTOS = 6;
export const MAX_TURNS = 8;

export type ItemSource = 'label' | 'estimate' | 'said';

// `nutrients` are for ONE serving and `servings` is how many were eaten. The server keeps them
// apart so the multiplying is done by code (see totals below), never by the AI.
export interface ChatItem extends DetectedFoodItem {
  source: ItemSource;
  servings: number;
  servingsPerContainer: number | null;
}

export interface MealTurnResult {
  reply: string;
  items: ChatItem[];
}

export const SOURCE_LABELS: Record<ItemSource, string> = { label: 'From label', estimate: 'Estimate', said: 'You said' };

function cleanItem(raw: any): ChatItem {
  const servings = typeof raw?.servings === 'number' && raw.servings > 0 ? raw.servings : 1;
  return {
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Food',
    confidence: raw?.confidence === 'low' ? 'low' : 'normal',
    portionDescription: typeof raw?.portionDescription === 'string' ? raw.portionDescription : '',
    nutrients: completeNutrients(raw?.nutrients ?? {}),
    source: raw?.source === 'label' || raw?.source === 'said' ? raw.source : 'estimate',
    servings,
    servingsPerContainer: typeof raw?.servingsPerContainer === 'number' && raw.servingsPerContainer > 0 ? raw.servingsPerContainer : null,
  };
}

export async function sendMealTurn(input: { items: ChatItem[]; message?: string; photoUri?: string }): Promise<MealTurnResult> {
  const images = input.photoUri ? [{ imageBase64: await prepareForUpload(input.photoUri), mimeType: 'image/jpeg' }] : [];
  const response = await fetch(`${API_BASE_URL}/api/meal-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(PROXY_SECRET ? { 'x-proxy-secret': PROXY_SECRET } : {}) },
    body: JSON.stringify({ items: input.items, message: input.message ?? '', images }),
  });
  // 503 means every free AI provider is out for now. The caller says so; nothing here ever
  // falls back to a paid model.
  if (!response.ok) throw new Error(`Meal helper request failed with status ${response.status}`);
  const body = await response.json();
  return {
    reply: typeof body?.reply === 'string' && body.reply.trim() ? body.reply.trim() : 'Updated.',
    items: Array.isArray(body?.items) ? body.items.map(cleanItem) : input.items,
  };
}

// ── Arithmetic, done here rather than by the AI ──────────────────────────────────────────────

export function itemCalories(item: ChatItem): number {
  return item.nutrients.calories * item.servings;
}

export function mealTotals(items: ChatItem[]): NutrientProfile {
  const total = {} as NutrientProfile;
  for (const key of NUTRIENT_KEYS) total[key] = items.reduce((sum, item) => sum + item.nutrients[key] * item.servings, 0);
  return total;
}

// "2.66" not "2.6600000001", and "3" not "3.00".
function tidy(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// How the amount reads in the list: "1 oz (28 g)" for one serving, "2.66 × 1 oz (28 g)" for more.
export function describePortion(item: ChatItem): string {
  const one = item.portionDescription.trim() || '1 serving';
  return item.servings === 1 ? one : `${tidy(item.servings)} × ${one}`;
}

// The meal as the rest of the app stores it: one line per food with the numbers for what was
// actually eaten. (Saved meals have a portion slider that only goes up to 3, so the servings are
// folded into the numbers here instead of being passed on as a multiplier.)
export function toMealItems(items: ChatItem[]): DetectedFoodItem[] {
  return items.map((item) => {
    const nutrients = {} as NutrientProfile;
    for (const key of NUTRIENT_KEYS) nutrients[key] = Math.round(item.nutrients[key] * item.servings * 10) / 10;
    return { name: item.name, confidence: item.confidence, portionDescription: describePortion(item), nutrients };
  });
}
