export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ConfidenceLevel = 'normal' | 'low';

export interface NutrientProfile {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  saturatedFatG: number;
  fiberG: number;
  sugarG: number;
  addedSugarG: number; // the part of sugarG that was added, not naturally in the food
  sodiumMg: number;
  cholesterolMg: number;
}

// Where a food's numbers came from. A guess must never be shown as if it were a fact, so this
// travels with the food from the first read all the way into the saved meal.
//   label    - copied off a printed Nutrition Facts label
//   estimate - the AI judged the food and its numbers from a photo
//   said     - the person named the food in words, but the NUMBERS are still the AI's (it recalled
//              typical values; it looked nothing up). So this is shown as a guess too.
//   typed    - the person typed the numbers in themselves
//   published - the server found the branded food in a public nutrition database (USDA or Open
//              Food Facts) and used those numbers. Only the server sets this, never the AI.
export type ItemSource = 'label' | 'estimate' | 'said' | 'typed' | 'published';

export const SOURCE_LABELS: Record<ItemSource, string> = { label: 'From label', estimate: 'AI estimate', said: 'AI estimate', typed: 'Your numbers', published: 'Published' };

// True when the numbers are the AI's own and were not read off a label or typed by the person.
export function isGuess(source: ItemSource | undefined): boolean {
  return source === 'estimate' || source === 'said';
}

export function asItemSource(value: unknown): ItemSource | undefined {
  return value === 'label' || value === 'estimate' || value === 'said' || value === 'typed' || value === 'published' ? value : undefined;
}

export interface DetectedFoodItem {
  source?: ItemSource; // missing on meals saved before this was recorded
  name: string;
  confidence: ConfidenceLevel;
  portionDescription: string;
  nutrients: NutrientProfile;
  // The weight of this portion in grams, when the AI judged one from a photo. It is the part of a
  // photo read most likely to be off, so the review screen shows it for the person to correct.
  grams?: number;
}

export interface AnalyzePhotoResponse {
  items: DetectedFoodItem[];
}

export const NUTRIENT_KEYS: (keyof NutrientProfile)[] = [
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'saturatedFatG',
  'fiberG',
  'sugarG',
  'addedSugarG',
  'sodiumMg',
  'cholesterolMg',
];

// Meals saved, or read by the server, before added sugar existed have no value for it. Treat
// that as 0 rather than letting a missing number turn every total into "not a number".
export function completeNutrients(nutrients: Partial<NutrientProfile>): NutrientProfile {
  const complete = {} as NutrientProfile;
  for (const key of NUTRIENT_KEYS) {
    const value = nutrients[key];
    complete[key] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  return complete;
}
