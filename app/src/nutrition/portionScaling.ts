import { NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';

export function scaleNutrients(nutrients: NutrientProfile, multiplier: number): NutrientProfile {
  const result = {} as NutrientProfile;
  for (const key of NUTRIENT_KEYS) {
    result[key] = nutrients[key] * multiplier;
  }
  return result;
}

export function applyFineTune(
  nutrients: NutrientProfile,
  fineTune: Partial<Record<keyof NutrientProfile, number>>
): NutrientProfile {
  const result = { ...nutrients };
  for (const key of NUTRIENT_KEYS) {
    const factor = fineTune[key];
    if (factor !== undefined) {
      result[key] = nutrients[key] * factor;
    }
  }
  return result;
}
