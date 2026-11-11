// Weights and heights are always STORED in kilograms and centimetres. These helpers only convert
// for display and typing, so changing the lb/kg setting never touches saved data.

export type WeightUnit = 'lb' | 'kg';

const LB_PER_KG = 2.2046226218;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

// Whole inches, because nobody quotes their height to a fraction of an inch. Rounding can land
// on 12 inches, which must roll over into the next foot (5'12" is really 6'0").
export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  return { ft: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * 2.54;
}

// One decimal is what a bathroom scale shows; more would be false precision.
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const value = unit === 'lb' ? kgToLb(kg) : kg;
  return Math.round(value * 10) / 10;
}

export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? lbToKg(value) : value;
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${toDisplayWeight(kg, unit).toFixed(1)} ${unit}`;
}
