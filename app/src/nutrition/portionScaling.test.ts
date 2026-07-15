import { scaleNutrients, applyFineTune } from './portionScaling';
import { NutrientProfile } from '../types/nutrition';

const base: NutrientProfile = {
  calories: 200,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  saturatedFatG: 2,
  fiberG: 3,
  sugarG: 4,
  sodiumMg: 300,
  cholesterolMg: 10,
};

describe('scaleNutrients', () => {
  it('scales every field by the multiplier', () => {
    const result = scaleNutrients(base, 1.5);
    expect(result.calories).toBeCloseTo(300);
    expect(result.proteinG).toBeCloseTo(15);
    expect(result.sodiumMg).toBeCloseTo(450);
  });

  it('leaves nutrients unchanged at multiplier 1', () => {
    expect(scaleNutrients(base, 1)).toEqual(base);
  });
});

describe('applyFineTune', () => {
  it('adjusts only the specified field', () => {
    const result = applyFineTune(base, { proteinG: 1.2 });
    expect(result.proteinG).toBeCloseTo(12);
    expect(result.calories).toBeCloseTo(200);
  });

  it('leaves nutrients unchanged with no fine-tune values', () => {
    expect(applyFineTune(base, {})).toEqual(base);
  });
});
