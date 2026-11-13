import { forgetLookups, fromOpenFoodFacts, fromUsda, lookupPublished, matchScore, plausible } from './foodLookup';

// Entries as Open Food Facts really returned them on 2026-11-12.
const dunkin = { brands: "Dunkin' Donuts", product_name: "Dunkin' Donuts, Bavarian Kreme Donut", serving_size: '100g', serving_quantity: 100, nutriments: { 'energy-kcal_100g': 267, proteins_100g: 3, fat_100g: 15, carbohydrates_100g: 30, sugars_100g: 11, sodium_100g: 0.37, 'saturated-fat_100g': 7 } };
const latte = { brands: 'Starbucks', product_name: 'Caffè Latte', serving_size: '220 ml', serving_quantity: 220, nutriments: { 'energy-kcal_100g': 70, 'energy-kcal_serving': 154, proteins_100g: 2.8, fat_100g: 2.4, carbohydrates_100g: 8.7, sugars_100g: 8.2, sodium_100g: 0.036, 'saturated-fat_100g': 1.5 } };
const proteinDrink = { brands: 'Starbucks', product_name: 'Protein Drink with Coffee - Caffè Latte', serving_size: '1 portion (330 g)', serving_quantity: 330, nutriments: { 'energy-kcal_100g': 51, proteins_100g: 6.2, fat_100g: 1, carbohydrates_100g: 4.2, sugars_100g: 3.9 } };
const yogurt = { brands: 'Chobani', product_name: 'Greek Yogurt Nonfat Plain', serving_size: '1 container (150 g)', serving_quantity: 150, nutriments: { 'energy-kcal_100g': 53.33, 'energy-kcal_serving': 80, proteins_100g: 9.33, fat_100g: 0, carbohydrates_100g: 4, sugars_100g: 3.33, sodium_100g: 0.0367 } };

const usdaYogurt = {
  description: 'GREEK YOGURT NONFAT PLAIN',
  brandOwner: 'Chobani, LLC',
  brandName: 'CHOBANI',
  servingSize: 170,
  servingSizeUnit: 'GRM',
  householdServingFullText: '3/4 CUP',
  foodNutrients: [
    { nutrientId: 1008, value: 53 },
    { nutrientId: 1003, value: 9.41 },
    { nutrientId: 1005, value: 3.53 },
    { nutrientId: 1004, value: 0 },
    { nutrientId: 2000, value: 2.35 },
    { nutrientId: 1093, value: 38 },
    { nutrientId: 1253, value: 6 },
  ],
};

const reply = (status: number, body: any) => ({ ok: status === 200, status, json: async () => body });

describe('matchScore', () => {
  it('matches the same product under different spellings', () => {
    expect(matchScore('Starbucks', 'Caffe Latte', 'Starbucks', 'Caffè Latte')).toBe(1);
    expect(matchScore('Dunkin', 'Bavarian Cream doughnut', "Dunkin' Donuts", "Dunkin' Donuts, Bavarian Kreme Donut")).toBe(1);
    expect(matchScore('Chobani', 'nonfat plain greek yogurt', 'Chobani', 'Greek Yogurt Nonfat Plain')).toBe(1);
  });
  it('refuses a different product from the same brand', () => {
    expect(matchScore('Starbucks', 'Caffe Latte', 'Starbucks', 'Protein Drink with Coffee - Caffè Latte')).toBe(0);
    expect(matchScore('Starbucks', 'Caffe Latte', 'Starbucks', 'Starbucks skinny latte')).toBe(0);
  });
  it('refuses another brand, and a request too vague to pin to one product', () => {
    expect(matchScore('Dunkin', 'Glazed donut', 'Krispy Kreme', 'Glazed donut')).toBe(0);
    expect(matchScore('Chobani', 'yogurt', 'Chobani', 'Greek Yogurt Nonfat Plain')).toBe(0);
  });
});

describe('plausible', () => {
  it('accepts numbers that add up and refuses ones that do not', () => {
    expect(plausible({ calories: 240, proteinG: 4, carbsG: 31, fatG: 11 })).toBe(true);
    expect(plausible({ calories: 1620, proteinG: 0, carbsG: 3, fatG: 0 })).toBe(false); // the coffee-pod row seen in testing
    expect(plausible({ calories: 100, proteinG: null, carbsG: 10, fatG: 1 })).toBe(false);
  });
});

describe('fromOpenFoodFacts', () => {
  it('turns an entry with a real serving into numbers for that serving', () => {
    const found = fromOpenFoodFacts(yogurt, 0)!;
    expect(found.from).toBe('Open Food Facts');
    expect(found.portionDescription).toBe('1 container (150 g)');
    expect(found.nutrients).toMatchObject({ calories: 80, proteinG: 14, carbsG: 6, fatG: 0, sugarG: 5, sodiumMg: 55 });
  });
  it('refuses an entry whose only serving is 100 g: there is no honest way to get to one donut', () => {
    expect(fromOpenFoodFacts(dunkin, 15)).toBeNull();
    // Seen live on 2026-11-12: a latte entry with serving "100.0g" got through and logged a 70-calorie latte.
    expect(fromOpenFoodFacts({ ...latte, serving_size: '100.0g', serving_quantity: '100' }, 0)).toBeNull();
    expect(fromOpenFoodFacts({ ...latte, serving_size: '100 ml', serving_quantity: 100 }, 0)).toBeNull();
    expect(fromOpenFoodFacts({ ...yogurt, serving_size: '1 bar (100 g)', serving_quantity: 100 }, 0)).not.toBeNull();
  });
  it('never reports more added sugar than sugar', () => {
    expect(fromOpenFoodFacts(yogurt, 20)!.nutrients.addedSugarG).toBe(5);
  });
});

describe('fromUsda', () => {
  it('scales per-100 g values to the stated serving', () => {
    const found = fromUsda(usdaYogurt, 0)!;
    expect(found.from).toBe('USDA');
    expect(found.portionDescription).toBe('3/4 cup (170 g)');
    expect(found.nutrients).toMatchObject({ calories: 90, proteinG: 16, carbsG: 6, sodiumMg: 65, cholesterolMg: 10 });
  });
  it('refuses a food with no serving size', () => {
    expect(fromUsda({ ...usdaYogurt, servingSize: undefined }, 0)).toBeNull();
  });
});

// Open Food Facts is two calls: a search that returns codes, then each product read in full.
const hit = (code: string, product: any) => ({ code, brands: [product.brands], product_name: product.product_name });
function openFoodFacts(products: Record<string, any>, searchStatus = 200, productStatus = 200) {
  return jest.fn(async (url: string) => {
    if (url.includes('search.openfoodfacts.org')) return reply(searchStatus, { hits: Object.entries(products).map(([code, product]) => hit(code, product)) });
    const code = url.match(/product\/(\d+)/)?.[1] ?? '';
    return reply(productStatus, { product: products[code] });
  });
}

describe('lookupPublished', () => {
  beforeEach(forgetLookups);

  it('uses Open Food Facts when there is no USDA key, reading only the product that matches', async () => {
    const fetchImpl = openFoodFacts({ '11111111': proteinDrink, '22222222': latte });
    const result = await lookupPublished('Starbucks', 'Caffe Latte', 0, { fetchImpl, usdaKey: undefined });
    expect(result).toMatchObject({ usda: 'off', openFoodFacts: 'hit' });
    expect(result.found).toMatchObject({ from: 'Open Food Facts', portionDescription: '220 ml' });
    expect(result.found!.nutrients.calories).toBe(154);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // one search, one product: the protein drink is never read
  });

  it('prefers the government database when both have the food', async () => {
    const off = openFoodFacts({ '33333333': yogurt });
    const fetchImpl = jest.fn(async (url: string) => (url.includes('usda.gov') ? reply(200, { foods: [usdaYogurt] }) : off(url)));
    const result = await lookupPublished('Chobani', 'Nonfat Plain Greek Yogurt', 0, { fetchImpl, usdaKey: 'k' });
    expect(result.found!.from).toBe('USDA');
  });

  it('finds nothing for the shop donut, whose only entry has no real serving size', async () => {
    const result = await lookupPublished('Dunkin', 'Bavarian Kreme Donut', 15, { fetchImpl: openFoodFacts({ '44444444': dunkin }), usdaKey: undefined });
    expect(result).toMatchObject({ found: null, openFoodFacts: 'miss' });
  });

  it('after Open Food Facts fails, leaves it alone instead of waiting on it again', async () => {
    const fetchImpl = openFoodFacts({ '22222222': latte }, 200, 503);
    const first = await lookupPublished('Starbucks', 'Caffe Latte', 0, { fetchImpl, usdaKey: undefined });
    expect(first).toMatchObject({ found: null, openFoodFacts: 'error' });
    const calls = fetchImpl.mock.calls.length;
    const second = await lookupPublished('Chobani', 'Nonfat Plain Greek Yogurt', 0, { fetchImpl, usdaKey: undefined });
    expect(second.openFoodFacts).toBe('resting');
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it('reports an error, not a crash, when the network fails', async () => {
    const broken = await lookupPublished('Starbucks', 'Caffe Latte', 0, { fetchImpl: jest.fn(async () => { throw new Error('network'); }), usdaKey: 'k' });
    expect(broken).toMatchObject({ found: null, usda: 'error', openFoodFacts: 'error' });
  });

  it('answers the same food from memory the second time', async () => {
    const fetchImpl = openFoodFacts({ '22222222': latte });
    await lookupPublished('Starbucks', 'Caffe Latte', 0, { fetchImpl, usdaKey: undefined });
    const again = await lookupPublished('starbucks', 'caffè latte', 0, { fetchImpl, usdaKey: undefined });
    expect(again.found!.nutrients.calories).toBe(154);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
