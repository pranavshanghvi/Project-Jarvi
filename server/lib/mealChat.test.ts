import { buildMealChatPrompt, ChatItem, parseMealChat, servingsEaten } from './mealChat';

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
