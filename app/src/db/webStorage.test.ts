import {
  createEntryWeb,
  deleteEntryWeb,
  getEntryWeb,
  getFirstEntryDateWeb,
  updateEntryWeb,
} from './webStorage';
import { buildItemUpdateParams } from './entriesRepository';
import { DetectedFoodItem } from '../types/nutrition';

// A tiny in-memory stand-in for the browser's localStorage, which jest does not provide.
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => void (store[k] = v),
};

const nutrients = { calories: 200, proteinG: 10, carbsG: 20, fatG: 5, saturatedFatG: 1, fiberG: 2, sugarG: 3, sodiumMg: 100, cholesterolMg: 10 };
const food = (name: string): DetectedFoodItem => ({ name, confidence: 'normal', portionDescription: '1', nutrients });

beforeEach(() => Object.keys(store).forEach((k) => delete store[k]));

describe('web entry editing', () => {
  it('reads, updates and deletes an entry', async () => {
    const id = await createEntryWeb('p.jpg', 'lunch', [
      { item: food('Rice'), portionMultiplier: 1 },
      { item: food('Beans'), portionMultiplier: 1 },
    ]);
    const entry = (await getEntryWeb(id))!;
    const [rice, beans] = entry.items;

    await updateEntryWeb(id, {
      mealType: 'dinner',
      timestamp: new Date(2026, 10, 1, 19).toISOString(),
      items: [{ id: rice.id, portionMultiplier: 2, nutrients: { ...nutrients, calories: 400 } }],
      removedItemIds: [beans.id],
    });
    const updated = (await getEntryWeb(id))!;
    expect(updated.mealType).toBe('dinner');
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]).toMatchObject({ id: rice.id, portionMultiplier: 2 });
    expect(updated.items[0].nutrients.calories).toBe(400);

    await deleteEntryWeb(id);
    expect(await getEntryWeb(id)).toBeNull();
  });

  it('renames a food and adds one the reader missed', async () => {
    const id = await createEntryWeb('p.jpg', 'lunch', [{ item: food('Rice'), portionMultiplier: 1 }]);
    const [rice] = (await getEntryWeb(id))!.items;
    await updateEntryWeb(id, {
      items: [{ id: rice.id, name: 'Brown rice', portionMultiplier: 1, nutrients: { ...nutrients, calories: 215 } }],
      addedItems: [{ item: food('Olive oil'), portionMultiplier: 1 }],
    });
    const updated = (await getEntryWeb(id))!;
    expect(updated.items.map((i) => i.name)).toEqual(['Brown rice', 'Olive oil']);
    expect(updated.items[0].nutrients.calories).toBe(215);
    expect(updated.items[1].id).not.toBe(rice.id);
  });

  it('finds the first entry date, or null when empty', async () => {
    expect(await getFirstEntryDateWeb()).toBeNull();
    await createEntryWeb('a', 'lunch', [], new Date(2026, 10, 9, 12));
    await createEntryWeb('b', 'lunch', [], new Date(2026, 9, 28, 23, 30));
    expect(await getFirstEntryDateWeb()).toBe('2026-10-28');
  });
});

describe('buildItemUpdateParams', () => {
  it('orders values to match the UPDATE statement', () => {
    expect(buildItemUpdateParams(7, { id: 3, portionMultiplier: 1.5, nutrients })).toEqual([1.5, 200, 10, 20, 5, 1, 2, 3, 100, 10, 0, 3, 7]);
  });
});
