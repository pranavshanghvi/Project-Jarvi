import { buildItemInsertParams, mapItemRow } from './entriesRepository';
import { DetectedFoodItem } from '../types/nutrition';

const item: DetectedFoodItem = {
  name: 'Grilled chicken',
  confidence: 'normal',
  portionDescription: '1 breast, ~150g',
  nutrients: {
    calories: 250,
    proteinG: 40,
    carbsG: 0,
    fatG: 8,
    saturatedFatG: 2,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 90,
    cholesterolMg: 100,
  },
};

describe('buildItemInsertParams', () => {
  it('maps a detected item and entry id into positional params', () => {
    const params = buildItemInsertParams(7, item, 1.2);
    expect(params).toEqual([7, 'Grilled chicken', 'normal', 1.2, 250, 40, 0, 8, 2, 0, 0, 90, 100]);
  });
});

describe('mapItemRow', () => {
  it('maps a raw db row back into a typed item', () => {
    const row = {
      id: 1,
      entry_id: 7,
      name: 'Grilled chicken',
      confidence: 'normal',
      portion_multiplier: 1.2,
      calories: 250,
      protein_g: 40,
      carbs_g: 0,
      fat_g: 8,
      saturated_fat_g: 2,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 90,
      cholesterol_mg: 100,
    };
    const mapped = mapItemRow(row);
    expect(mapped.name).toBe('Grilled chicken');
    expect(mapped.nutrients.proteinG).toBe(40);
    expect(mapped.portionMultiplier).toBe(1.2);
  });
});
