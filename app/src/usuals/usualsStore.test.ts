jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatItem } from '../api/mealChat';
import type { StoredEntry } from '../db/entriesRepository';
import { clockDistance, findRepeat, getUsuals, rankUsuals, recordUse, removeUsual, saveUsual, signature, suggestName, usualCalories, Usual } from './usualsStore';

const n = (calories: number) => ({ calories, proteinG: 0, carbsG: 0, fatG: 0, saturatedFatG: 0, fiberG: 0, sugarG: 0, addedSugarG: 0, sodiumMg: 0, cholesterolMg: 0 });
const food = (name: string, calories: number, servings = 1): ChatItem => ({ name, confidence: 'normal', portionDescription: '1 serving', nutrients: n(calories), source: 'said', servings, servingsPerContainer: null });
const coffee = [food('Black coffee', 2), food('2% milk', 120, 0.125), food('Sugar', 16)];
const at = (hour: number, minute = 0, day = 12) => new Date(2026, 10, day, hour, minute);

beforeEach(() => AsyncStorage.clear());

describe('usuals', () => {
  it('keeps a meal and counts its calories from servings', async () => {
    const [saved] = await saveUsual('My coffee', coffee, at(7, 40));
    expect(saved).toMatchObject({ name: 'My coffee', minuteOfDay: 460, uses: 1 });
    expect(usualCalories(saved)).toBe(33);
    expect(await getUsuals()).toHaveLength(1);
  });

  it('replaces a usual made of the same foods instead of adding a twin', async () => {
    await saveUsual('My coffee', coffee, at(7, 40));
    const list = await saveUsual('Morning coffee', [...coffee].reverse(), at(8));
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Morning coffee');
  });

  it('counts each use and drifts toward the time it is really had', async () => {
    const [saved] = await saveUsual('My coffee', coffee, at(7, 40));
    const [used] = await recordUse(saved.id, at(8, 10));
    expect(used.uses).toBe(2);
    expect(used.minuteOfDay).toBe(470);
    // A one-off at a very different hour does not drag the usual time away.
    const [late] = await recordUse(saved.id, at(15));
    expect(late.minuteOfDay).toBe(470);
  });

  it('forgets a usual', async () => {
    const [saved] = await saveUsual('My coffee', coffee, at(7, 40));
    expect(await removeUsual(saved.id)).toEqual([]);
  });

  it('survives damaged storage', async () => {
    await AsyncStorage.setItem('jarvi.usuals', '{not json');
    expect(await getUsuals()).toEqual([]);
  });
});

describe('which usual comes first', () => {
  const usual = (name: string, minute: number, uses: number): Usual => ({ id: name, name, items: coffee, minuteOfDay: minute, uses, lastUsed: '2026-11-10T12:00:00.000Z' });

  it('measures time of day the short way round midnight', () => {
    expect(clockDistance(23 * 60 + 50, 10)).toBe(20);
    expect(clockDistance(460, 470)).toBe(10);
  });

  it('puts the one normally had around now first, then the most used', () => {
    const list = [usual('Dinner', 19 * 60, 40), usual('Coffee', 460, 3), usual('Oatmeal', 8 * 60 + 30, 9), usual('Lunch', 13 * 60, 20)];
    expect(rankUsuals(list, at(7, 38)).map((u) => u.name)).toEqual(['Coffee', 'Oatmeal', 'Dinner', 'Lunch']);
  });
});

describe('naming', () => {
  it('ignores order and capitals when comparing meals', () => {
    expect(signature(['Sugar', ' black coffee '])).toBe(signature(['Black Coffee', 'sugar']));
  });

  it('suggests a name that can be changed, and avoids one already taken', () => {
    expect(suggestName(coffee, 'breakfast', [])).toBe('My coffee');
    expect(suggestName(coffee, 'breakfast', [{ name: 'my coffee' }])).toBe('My coffee 2');
    expect(suggestName([food('Green tea', 2)], 'snack', [])).toBe('My tea');
    expect(suggestName([food('2% milk', 15), food('Sugar', 16)], 'lunch', [], 'the milk in my coffee, two tablespoons')).toBe('My coffee');
    expect(suggestName([food('Protein bar', 200)], 'snack', [])).toBe('Protein bar');
    expect(suggestName([food('Dal', 200), food('Rice', 200)], 'dinner', [])).toBe('My dinner');
  });
});

describe('noticing a repeat', () => {
  const entry = (id: number, when: Date, names: string[]): StoredEntry => ({ id, timestamp: when.toISOString(), mealType: 'breakfast', photoPath: '', items: names.map((name, i) => ({ id: id * 10 + i, entryId: id, name, confidence: 'normal', portionMultiplier: 0.5, nutrients: n(40) })) });

  it('offers a meal logged on two different days', () => {
    const repeat = findRepeat([entry(1, at(7, 40, 10), ['Coffee', 'Milk']), entry(2, at(7, 45, 11), ['milk', 'coffee']), entry(3, at(13, 0, 11), ['Salad'])], []);
    expect(repeat).toMatchObject({ days: 2, minuteOfDay: 465 });
    expect(repeat!.items.map((item) => item.name)).toEqual(['milk', 'coffee']);
    expect(repeat!.items[0].nutrients.calories).toBe(20);
  });

  it('does not offer the same meal twice in one day, or one that is already a usual', async () => {
    expect(findRepeat([entry(1, at(7, 40, 10), ['Coffee']), entry(2, at(15, 0, 10), ['Coffee'])], [])).toBeNull();
    const usuals = await saveUsual('My coffee', [food('Coffee', 2)], at(7, 40));
    expect(findRepeat([entry(1, at(7, 40, 10), ['Coffee']), entry(2, at(7, 40, 11), ['coffee'])], usuals)).toBeNull();
  });
});
