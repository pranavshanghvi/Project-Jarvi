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
  'sodiumMg',
  'cholesterolMg',
];
