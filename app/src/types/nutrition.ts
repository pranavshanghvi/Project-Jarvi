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

export interface DetectedFoodItem {
  name: string;
  confidence: ConfidenceLevel;
  portionDescription: string;
  nutrients: NutrientProfile;
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
