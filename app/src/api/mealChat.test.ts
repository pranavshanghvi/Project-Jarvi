jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({ resize: jest.fn(), renderAsync: jest.fn().mockResolvedValue({ saveAsync: jest.fn().mockResolvedValue({ base64: 'jpegBase64' }) }) })),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { ChatItem, describePortion, itemCalories, mealTotals, sendMealTurn, toMealItems } from './mealChat';

const perServing = { calories: 150, proteinG: 2, carbsG: 16, fatG: 9, saturatedFatG: 1, fiberG: 1, sugarG: 1, addedSugarG: 0, sodiumMg: 110, cholesterolMg: 0 };
const chips: ChatItem = { name: 'Kettle chips', confidence: 'normal', portionDescription: '1 oz (28 g)', nutrients: perServing, source: 'label', servings: 2.66, servingsPerContainer: 8 };
const coke: ChatItem = { name: 'Coca-Cola', confidence: 'normal', portionDescription: '1 can', nutrients: { ...perServing, calories: 140, sugarG: 39, addedSugarG: 39, fatG: 0 }, source: 'said', servings: 1, servingsPerContainer: null };

describe('meal arithmetic', () => {
  it('multiplies per-serving numbers by the servings eaten', () => {
    expect(itemCalories(chips)).toBeCloseTo(399, 0);
    const totals = mealTotals([chips, coke]);
    expect(totals.calories).toBeCloseTo(539, 0);
    expect(totals.addedSugarG).toBe(39);
  });

  it('describes one serving plainly and several as a multiple', () => {
    expect(describePortion(coke)).toBe('1 can');
    expect(describePortion(chips)).toBe('2.66 × 1 oz (28 g)');
    expect(describePortion({ ...coke, portionDescription: ' ' })).toBe('1 serving');
  });

  it('hands the rest of the app the numbers for what was actually eaten', () => {
    const [saved] = toMealItems([chips]);
    expect(saved.nutrients.calories).toBe(399);
    expect(saved.portionDescription).toBe('2.66 × 1 oz (28 g)');
    expect(saved).not.toHaveProperty('servings');
  });
});

describe('sendMealTurn', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('sends the meal so far, the message and a shrunken photo, and tidies what comes back', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: ' Added. ', items: [{ name: 'Toast', source: 'nonsense', servings: -2, nutrients: { calories: 80 } }] }),
    });
    const result = await sendMealTurn({ items: [chips], message: 'and toast', photoUri: 'file:///meal.heic' });
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/api/meal-chat');
    const sent = JSON.parse(request.body);
    expect(sent.items[0].name).toBe('Kettle chips');
    expect(sent.message).toBe('and toast');
    expect(sent.images).toEqual([{ imageBase64: 'jpegBase64', mimeType: 'image/jpeg' }]);
    expect(result.reply).toBe('Added.');
    // Unknown source becomes the cautious one, a bad servings count becomes 1, missing numbers become 0.
    expect(result.items[0]).toMatchObject({ name: 'Toast', source: 'estimate', servings: 1, servingsPerContainer: null });
    expect(result.items[0].nutrients.addedSugarG).toBe(0);
  });

  it('sends no image for a typed or spoken turn', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ reply: 'ok', items: [] }) });
    await sendMealTurn({ items: [], message: 'two eggs' });
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).images).toEqual([]);
  });

  it('throws when the helper is unavailable, so the screen can say so', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });
    await expect(sendMealTurn({ items: [], message: 'two eggs' })).rejects.toThrow('503');
  });
});
