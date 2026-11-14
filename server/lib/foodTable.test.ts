import { findFood, foodWords, nutrientsFor } from './foodTable';

const guess = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, saturatedFatG: 0, fiberG: 0, sugarG: 10, addedSugarG: 5, sodiumMg: 0, cholesterolMg: 0 };

describe('foodWords', () => {
  it('ignores filler, plurals and spelling differences', () => {
    expect(foodWords('A bowl of Steamed Broccoli').sort()).toEqual(['broccoli', 'cooked']);
    expect(foodWords('Donuts')).toEqual(['doughnut']);
    expect(foodWords('cherry tomatoes').sort()).toEqual(['raw', 'tomato']);
  });
});

describe('findFood', () => {
  it('finds everyday foods under the names the AI gives them', () => {
    expect(findFood('Grilled chicken breast')?.name).toMatch(/^Chicken breast/);
    expect(findFood('Scrambled eggs')?.name).toBe('Egg omelet or scrambled egg, NS as to fat');
    expect(findFood('Grilled salmon')?.name).toBe('Fish, salmon, grilled');
    expect(findFood('French fries')?.name).toMatch(/^Potato, french fries/);
    expect(findFood('Bavarian cream donut')?.name).toBe('Doughnut, custard-filled');
    expect(findFood('Pepperoni pizza')?.name).toMatch(/^Pizza with pepperoni/);
  });

  it('takes the table\'s own default when the name says no more', () => {
    expect(findFood('Sausage')?.name).toBe('Sausage, NFS');
    expect(findFood('chicken')?.name).toMatch(/^Chicken, NS as to part/);
  });

  it('never settles for a special version nobody asked for', () => {
    expect(findFood('chicken')?.name).not.toMatch(/meatless/i);
    expect(findFood('zucchini')?.name).not.toMatch(/pickled|Bread/);
    expect(findFood('yogurt')?.name).not.toMatch(/nonfat|fat free/i);
  });

  it('does not mistake a dish for its sauce, or a food for a dish it is in', () => {
    expect(findFood('Spaghetti with meat sauce')?.name ?? '').not.toMatch(/^Spaghetti sauce/);
    expect(findFood('broccoli')?.name).toMatch(/^Broccoli/);
    expect(findFood('Tomato soup')?.name).toBe('Soup, tomato');
  });

  it('finds nothing rather than something wrong', () => {
    expect(findFood('Chicken tikka masala')).toBeNull();
    expect(findFood('Quarter Pounder Deluxe Xtreme')).toBeNull();
    expect(findFood('')).toBeNull();
  });
});

describe('nutrientsFor', () => {
  it('scales the per-100 g values to the weight', () => {
    const food = findFood('Olive oil')!;
    const n = nutrientsFor(food, 14, guess);
    expect(n.calories).toBe(126);
    expect(n.fatG).toBe(14);
  });

  it('keeps the AI\'s share of added sugar, since the table has no such column', () => {
    const food = findFood('Bavarian cream donut')!;
    const n = nutrientsFor(food, 77, guess);
    expect(n.addedSugarG).toBeCloseTo(n.sugarG / 2, 0);
    expect(n.addedSugarG).toBeLessThanOrEqual(n.sugarG);
  });
});
