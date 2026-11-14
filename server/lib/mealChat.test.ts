import { applyPublished, applyTable, buildMealChatPrompt, ChatItem, keepPublished, parseMealChat, servingsEaten } from './mealChat';

const nutrients = { calories: 150, proteinG: 2, carbsG: 16, fatG: 9, saturatedFatG: 1, fiberG: 1, sugarG: 1, addedSugarG: 0, sodiumMg: 110, cholesterolMg: 0 };
const chips: ChatItem = { name: 'Kettle chips', source: 'label', confidence: 'normal', portionDescription: '1 oz (28 g)', servingsPerContainer: 8, servings: 1, nutrients };
// What the model sends back: the same line, with how much was eaten instead of a servings count.
const fromModel = (eaten: any, extra: any = {}) => ({ name: 'Kettle chips', source: 'label', confidence: 'normal', portionDescription: '1 oz (28 g)', servingsPerContainer: 8, eaten, nutrients, ...extra });

describe('parseMealChat', () => {
  it('reads the reply and the items with their source', () => {
    const result = parseMealChat(JSON.stringify({ reply: 'One serving, 150 calories.', items: [fromModel({ quantity: 1, unit: 'servings' })] }));
    expect(result.reply).toBe('One serving, 150 calories.');
    expect(result.items[0]).toMatchObject({ source: 'label', servings: 1, servingsPerContainer: 8 });
    expect(result.items[0].nutrients.calories).toBe(150);
  });

  it('turns "a third of the bag" into servings in code, leaving the per-serving numbers alone', () => {
    // The live failure this guards against: the model scaled the numbers itself and got 50 calories.
    const result = parseMealChat(JSON.stringify({ reply: 'ok', items: [fromModel({ quantity: 0.333, unit: 'containers' })] }));
    expect(result.items[0].servings).toBeCloseTo(2.66, 2);
    expect(result.items[0].nutrients.calories).toBe(150);
    expect(result.items[0].servings * result.items[0].nutrients.calories).toBeCloseTo(400, -1);
  });

  it('treats a missing or unknown source as an estimate, the cautious label', () => {
    const result = parseMealChat(JSON.stringify({ reply: 'ok', items: [fromModel({ quantity: 1, unit: 'servings' }, { source: 'guess' }), fromModel(undefined, { source: undefined })] }));
    expect(result.items.map((i) => i.source)).toEqual(['estimate', 'estimate']);
  });

  it('accepts an answer wrapped in a code fence and supplies a reply when none came', () => {
    const result = parseMealChat('```json\n' + JSON.stringify({ items: [] }) + '\n```');
    expect(result).toEqual({ reply: 'Updated.', items: [] });
  });

  it('never lets added sugar exceed total sugar', () => {
    const result = parseMealChat(JSON.stringify({ reply: 'ok', items: [fromModel({ quantity: 1, unit: 'servings' }, { nutrients: { ...nutrients, sugarG: 5, addedSugarG: 40 } })] }));
    expect(result.items[0].nutrients.addedSugarG).toBe(5);
  });

  it('refuses prose and items with missing numbers, so the router moves on rather than log holes', () => {
    expect(() => parseMealChat('Sure! That looks like chips.')).toThrow();
    expect(() => parseMealChat(JSON.stringify({ reply: 'ok', items: [{ name: 'Chips', nutrients: { calories: 150 } }] }))).toThrow(/missing nutrient fields/);
  });
});

describe('servingsEaten', () => {
  it('counts servings as given and containers times the container size', () => {
    expect(servingsEaten({ quantity: 2, unit: 'servings' }, 8)).toBe(2);
    expect(servingsEaten({ quantity: 0.5, unit: 'containers' }, 8)).toBe(4);
    expect(servingsEaten({ quantity: 1, unit: 'containers' }, 2.5)).toBe(2.5);
  });

  it('falls back to one serving for anything missing or nonsensical, and keeps within sane limits', () => {
    expect(servingsEaten(undefined, null)).toBe(1);
    expect(servingsEaten({ quantity: -3, unit: 'servings' }, null)).toBe(1);
    expect(servingsEaten({ quantity: 0.5, unit: 'containers' }, null)).toBe(0.5); // no container size to multiply by
    expect(servingsEaten({ quantity: 900, unit: 'servings' }, null)).toBe(50);
  });
});

describe('buildMealChatPrompt', () => {
  it('carries the list so far, what was said, and how many photos came', () => {
    const prompt = buildMealChatPrompt([chips], '  a third of the bag ', 1);
    expect(prompt).toContain('"Kettle chips"');
    expect(prompt).toContain('"a third of the bag"');
    expect(prompt).toContain('NEW PHOTOS ATTACHED: 1');
    expect(prompt).toContain('"eaten":{"quantity":1,"unit":"servings"}');
  });

  it('says so plainly when the list is empty and nothing was said', () => {
    const prompt = buildMealChatPrompt([], '', 1);
    expect(prompt).toContain('nothing logged yet');
    expect(prompt).toContain('THE PERSON SAYS: (nothing)');
  });
});

describe('published numbers', () => {
  const published = { calories: 154, proteinG: 6.2, carbsG: 19.1, fatG: 5.3, saturatedFatG: 3.3, fiberG: 0, sugarG: 18, addedSugarG: 0, sodiumMg: 79, cholesterolMg: 0 };
  const guess = (extra: Partial<ChatItem> = {}): ChatItem => ({ name: 'Caffe Latte', brand: 'Starbucks', source: 'said', confidence: 'low', portionDescription: '1 cup', servingsPerContainer: null, servings: 1, nutrients, ...extra });
  const hit = async () => ({ found: { nutrients: published, portionDescription: '220 ml', from: 'Open Food Facts' as const }, usda: 'off' as const, openFoodFacts: 'hit' as const });
  const miss = async () => ({ found: null, usda: 'off' as const, openFoodFacts: 'miss' as const });

  it('replaces a guess with the published numbers and says where they came from', async () => {
    const result = { reply: 'I added a latte.', items: [guess()] };
    await applyPublished(result, hit, 5000);
    expect(result.items[0]).toMatchObject({ name: 'Starbucks Caffe Latte', source: 'published', portionDescription: '220 ml', nutrients: published, confidence: 'normal' });
    expect(result.reply).toContain('published numbers from Open Food Facts, for 220 ml');
  });

  it('leaves the guess alone when nothing matches, when there is no brand, and when there is no time left', async () => {
    const lookup = jest.fn(miss);
    const result = { reply: 'ok', items: [guess(), guess({ brand: null })] };
    await applyPublished(result, lookup, 5000);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result.items.map((i) => i.source)).toEqual(['said', 'said']);
    expect(result.reply).toBe('ok');
    const late = jest.fn(hit);
    await applyPublished(result, late, 900);
    expect(late).not.toHaveBeenCalled();
  });

  it('never looks up a food read off a label, and survives a look-up that throws', async () => {
    const lookup = jest.fn(async () => { throw new Error('down'); });
    const result = { reply: 'ok', items: [guess({ source: 'label' }), guess()] };
    await applyPublished(result, lookup, 5000);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result.items[1].source).toBe('said');
  });

  it('does not let the AI hand out the published mark or alter published numbers', () => {
    const before = [guess({ name: 'Starbucks Caffe Latte', source: 'published', nutrients: published, portionDescription: '220 ml' })];
    const returned = [guess({ name: 'starbucks caffe latte', source: 'published', nutrients, portionDescription: '1 cup', servings: 2 }), guess({ name: 'Muffin', source: 'published' })];
    keepPublished(returned, before);
    expect(returned[0]).toMatchObject({ source: 'published', nutrients: published, portionDescription: '220 ml', servings: 2 });
    expect(returned[1].source).toBe('estimate');
  });

  it('asks the AI for the brand only when it was said or printed', () => {
    const prompt = buildMealChatPrompt([], 'a Starbucks latte', 0);
    expect(prompt).toContain('"brand": string | null');
    expect(prompt).toContain('Never guess a brand');
  });
});

describe('weight x the food table', () => {
  const guessed = (extra: Partial<ChatItem> = {}): ChatItem => ({ name: 'Grilled chicken breast', source: 'estimate', confidence: 'normal', portionDescription: '1 chicken breast', servingsPerContainer: null, servings: 1, grams: 200, nutrients: { ...nutrients, calories: 180 }, ...extra });

  it('works the numbers out from the weight and the table, and keeps what the AI guessed beside them', () => {
    const items = [guessed()];
    applyTable(items, []);
    expect(items[0].tableFood).toMatch(/^Chicken breast/);
    expect(items[0].nutrients.calories).toBeGreaterThan(300); // 200 g of chicken breast, not the AI's 180
    expect(items[0].nutrients.proteinG).toBeGreaterThan(40);
    expect(items[0].aiCalories).toBe(180);
  });

  it('gives the same food and weight the same numbers whatever the AI guessed', () => {
    const a = [guessed({ nutrients: { ...nutrients, calories: 250 } })];
    const b = [guessed({ nutrients: { ...nutrients, calories: 350 } })];
    applyTable(a, []);
    applyTable(b, []);
    expect(a[0].nutrients).toEqual(b[0].nutrients);
  });

  it('keeps the AI\'s numbers when there is no weight, no such food, or a label or published source', () => {
    const items = [guessed({ grams: null }), guessed({ name: 'Chicken tikka masala' }), guessed({ source: 'label' }), guessed({ source: 'published' })];
    applyTable(items, []);
    for (const item of items) {
      expect(item.nutrients.calories).toBe(180);
      expect(item.tableFood).toBeNull();
    }
  });

  it('distrusts a match that is wildly out of line with the AI, since that is more likely the wrong food', () => {
    const items = [guessed({ name: 'Olive oil', grams: 200, nutrients: { ...nutrients, calories: 120 } })]; // 200 g of oil would be 1,800
    applyTable(items, []);
    expect(items[0].nutrients.calories).toBe(120);
    expect(items[0].tableFood).toBeNull();
  });

  it('leaves a food that came back untouched exactly as it was, so corrected numbers are not recalculated', () => {
    const corrected = guessed({ nutrients: { ...nutrients, calories: 240 }, grams: null });
    const items = [guessed({ nutrients: { ...nutrients, calories: 240 } })]; // the AI echoed the numbers and added a weight
    applyTable(items, [corrected]);
    expect(items[0].nutrients.calories).toBe(240);
    expect(items[0].tableFood).toBeNull();
  });

  it('recalculates when the person changes the weight', () => {
    const before = guessed();
    applyTable([before], []);
    const items = [{ ...before, grams: 100 }];
    applyTable(items, [before]);
    expect(items[0].nutrients.calories).toBeLessThan(before.nutrients.calories);
  });

  it('asks the AI for a weight judged from the photo, not from a standard serving', () => {
    const prompt = buildMealChatPrompt([], '', 1);
    expect(prompt).toContain('"grams": number | null');
    expect(prompt).toContain('NOT from a standard serving size');
  });

  it('reads the weight and drops one that is not believable', () => {
    const read = (grams: any) => parseMealChat(JSON.stringify({ reply: 'ok', items: [fromModel({ quantity: 1, unit: 'servings' }, { grams })] })).items[0].grams;
    expect(read(151.6)).toBe(152);
    expect(read(-5)).toBeNull();
    expect(read('a lot')).toBeNull();
    expect(read(90000)).toBeNull();
  });
});
