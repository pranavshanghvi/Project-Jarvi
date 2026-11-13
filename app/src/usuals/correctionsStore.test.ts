import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatItem } from '../api/mealChat';
import { applyCorrections, foodWords, getCorrections, rememberCorrections, sameFood } from './correctionsStore';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => void store.set(key, value)),
      clear: jest.fn(async () => store.clear()),
    },
  };
});

const real = { calories: 240, proteinG: 4, carbsG: 31, fatG: 11, saturatedFatG: 4, fiberG: 1, sugarG: 11, addedSugarG: 11, sodiumMg: 310, cholesterolMg: 0 };
const guessed = { calories: 350, proteinG: 10, carbsG: 50, fatG: 15, saturatedFatG: 8, fiberG: 2, sugarG: 20, addedSugarG: 15, sodiumMg: 400, cholesterolMg: 0 };
const item = (name: string, extra: Partial<ChatItem> = {}): ChatItem => ({ name, source: 'estimate', confidence: 'low', portionDescription: '1 donut', servings: 1, servingsPerContainer: null, nutrients: guessed, ...extra });

beforeEach(() => (AsyncStorage as any).clear());

describe('foodWords and sameFood', () => {
  it('sees through spelling, capitals, plurals and filler words', () => {
    expect(foodWords("Dunkin' Bavarian Kreme Donuts")).toEqual(foodWords('a dunkin bavarian cream doughnut'));
  });
  it('matches the same food and a fuller name for it, but not a different food', () => {
    const saved = foodWords('Dunkin Bavarian Kreme donut');
    expect(sameFood(saved, foodWords('Bavarian cream donut'))).toBe(true);
    expect(sameFood(saved, foodWords('powdered sugar donut'))).toBe(false);
    expect(sameFood(foodWords('chocolate glazed donut'), foodWords('chocolate donut'))).toBe(false);
    expect(sameFood(foodWords('bagel'), foodWords('bagel'))).toBe(true);
    expect(sameFood([], foodWords('bagel'))).toBe(false);
  });
});

describe('remembering and applying', () => {
  it("replaces the AI's guess with the numbers the person typed, the next time that food comes up", async () => {
    const corrections = await rememberCorrections([{ name: 'Bavarian cream bagel', nutrients: real }]);
    const { items, used } = applyCorrections([item('bavarian cream bagel', { servings: 2 }), item('coffee')], corrections);
    expect(items[0]).toMatchObject({ nutrients: real, source: 'typed', confidence: 'normal', servings: 2, portionDescription: '1 donut' });
    expect(items[1].nutrients).toBe(guessed);
    expect(used.map((c) => c.name)).toEqual(['Bavarian cream bagel']);
  });

  it('leaves alone numbers that were read off a label or found in a database', async () => {
    const corrections = await rememberCorrections([{ name: 'Greek yogurt', nutrients: real }]);
    const { items, used } = applyCorrections([item('Greek yogurt', { source: 'label' }), item('Greek yogurt', { source: 'published' })], corrections);
    expect(items.map((i) => i.nutrients)).toEqual([guessed, guessed]);
    expect(used).toEqual([]);
  });

  it('keeps only the newest correction for a food, and survives being read back', async () => {
    await rememberCorrections([{ name: 'Bavarian Kreme Donut', nutrients: guessed }]);
    await rememberCorrections([{ name: 'bavarian cream donuts', nutrients: real, portionDescription: '1 donut (77 g)' }]);
    const saved = await getCorrections();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ nutrients: real, portionDescription: '1 donut (77 g)' });
  });

  it('does not save a food with no name or no numbers', async () => {
    const empty = { ...real, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, saturatedFatG: 0, fiberG: 0, sugarG: 0, addedSugarG: 0, sodiumMg: 0 };
    expect(await rememberCorrections([{ name: '  ', nutrients: real }, { name: 'Mystery', nutrients: empty }])).toEqual([]);
  });

  it('prefers the exact food over a fuller name that merely contains it', async () => {
    const other = { ...real, calories: 300 };
    const corrections = await rememberCorrections([{ name: 'Dunkin Bavarian cream donut', nutrients: other }, { name: 'Bavarian cream donut', nutrients: real }]);
    expect(applyCorrections([item('Bavarian Kreme Donut')], corrections).items[0].nutrients.calories).toBe(240);
  });
});
