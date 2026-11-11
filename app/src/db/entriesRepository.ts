import { Platform } from 'react-native';
import { getDatabase } from './client';
import { DetectedFoodItem, MealType, NutrientProfile } from '../types/nutrition';
import { toDateKey } from '../nutrition/aggregation';
import {
  createEntryWeb,
  deleteEntryWeb,
  getEntriesForDateWeb,
  getEntriesInRangeWeb,
  getEntryWeb,
  getFirstEntryDateWeb,
  updateEntryWeb,
  updateMealTypeWeb,
} from './webStorage';

export interface StoredItem {
  id: number;
  entryId: number;
  name: string;
  confidence: 'normal' | 'low';
  portionMultiplier: number;
  nutrients: NutrientProfile;
}

export interface StoredEntry {
  id: number;
  timestamp: string;
  mealType: MealType;
  photoPath: string;
  items: StoredItem[];
}

export function buildItemInsertParams(
  entryId: number,
  item: DetectedFoodItem,
  portionMultiplier: number
): (string | number)[] {
  const n = item.nutrients;
  return [
    entryId,
    item.name,
    item.confidence,
    portionMultiplier,
    n.calories,
    n.proteinG,
    n.carbsG,
    n.fatG,
    n.saturatedFatG,
    n.fiberG,
    n.sugarG,
    n.sodiumMg,
    n.cholesterolMg,
    n.addedSugarG ?? 0,
  ];
}

export function mapItemRow(row: any): StoredItem {
  return {
    id: row.id,
    entryId: row.entry_id,
    name: row.name,
    confidence: row.confidence,
    portionMultiplier: row.portion_multiplier,
    nutrients: {
      calories: row.calories,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      saturatedFatG: row.saturated_fat_g,
      fiberG: row.fiber_g,
      sugarG: row.sugar_g,
      sodiumMg: row.sodium_mg,
      cholesterolMg: row.cholesterol_mg,
      addedSugarG: row.added_sugar_g ?? 0,
    },
  };
}

export async function createEntry(
  photoPath: string,
  mealType: MealType,
  itemsWithPortions: { item: DetectedFoodItem; portionMultiplier: number }[],
  eatenAt: Date = new Date()
): Promise<number> {
  if (Platform.OS === 'web') {
    return createEntryWeb(photoPath, mealType, itemsWithPortions, eatenAt);
  }
  const db = await getDatabase();
  const timestamp = eatenAt.toISOString();
  const entryResult = await db.runAsync(
    'INSERT INTO entries (timestamp, meal_type, photo_path) VALUES (?, ?, ?);',
    [timestamp, mealType, photoPath]
  );
  const entryId = entryResult.lastInsertRowId;
  for (const { item, portionMultiplier } of itemsWithPortions) {
    const params = buildItemInsertParams(entryId, item, portionMultiplier);
    await db.runAsync(
      `INSERT INTO items (
        entry_id, name, confidence, portion_multiplier,
        calories, protein_g, carbs_g, fat_g, saturated_fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, added_sugar_g
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params
    );
  }
  return entryId;
}

async function fetchEntriesWithItems(entryRows: any[]): Promise<StoredEntry[]> {
  const db = await getDatabase();
  const entries: StoredEntry[] = [];
  for (const row of entryRows) {
    const itemRows = await db.getAllAsync('SELECT * FROM items WHERE entry_id = ?;', [row.id]);
    entries.push({
      id: row.id,
      timestamp: row.timestamp,
      mealType: row.meal_type,
      photoPath: row.photo_path,
      items: itemRows.map(mapItemRow),
    });
  }
  return entries;
}

export async function getEntriesForDate(dateKey: string): Promise<StoredEntry[]> {
  if (Platform.OS === 'web') {
    return getEntriesForDateWeb(dateKey);
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    'SELECT * FROM entries WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC;',
    [startOfDay.toISOString(), endOfDay.toISOString()]
  );
  return fetchEntriesWithItems(rows);
}

export async function getEntriesInRange(startKey: string, endKey: string): Promise<StoredEntry[]> {
  if (Platform.OS === 'web') {
    return getEntriesInRangeWeb(startKey, endKey);
  }
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const startOfRange = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const endOfRange = new Date(ey, em - 1, ed + 1, 0, 0, 0, 0);
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    'SELECT * FROM entries WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC;',
    [startOfRange.toISOString(), endOfRange.toISOString()]
  );
  return fetchEntriesWithItems(rows);
}

export async function updateMealType(entryId: number, mealType: MealType): Promise<void> {
  if (Platform.OS === 'web') {
    return updateMealTypeWeb(entryId, mealType);
  }
  const db = await getDatabase();
  await db.runAsync('UPDATE entries SET meal_type = ? WHERE id = ?;', [mealType, entryId]);
}

export async function getEntry(entryId: number): Promise<StoredEntry | null> {
  if (Platform.OS === 'web') {
    return getEntryWeb(entryId);
  }
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM entries WHERE id = ?;', [entryId]);
  if (rows.length === 0) return null;
  return (await fetchEntriesWithItems(rows))[0];
}

// Removes the meal and every food item that belongs to it.
export async function deleteEntry(entryId: number): Promise<void> {
  if (Platform.OS === 'web') {
    return deleteEntryWeb(entryId);
  }
  const db = await getDatabase();
  await db.runAsync('DELETE FROM items WHERE entry_id = ?;', [entryId]);
  await db.runAsync('DELETE FROM entries WHERE id = ?;', [entryId]);
}

// The values for one item's UPDATE, in the same order as the SQL in updateEntry.
export function buildItemUpdateParams(
  entryId: number,
  item: { id: number; portionMultiplier: number; nutrients: NutrientProfile }
): (string | number)[] {
  const n = item.nutrients;
  return [
    item.portionMultiplier,
    n.calories,
    n.proteinG,
    n.carbsG,
    n.fatG,
    n.saturatedFatG,
    n.fiberG,
    n.sugarG,
    n.sodiumMg,
    n.cholesterolMg,
    n.addedSugarG ?? 0,
    item.id,
    entryId,
  ];
}

// Edits a saved meal: time, meal type, new portion/nutrient numbers for some items, and removal
// of others. Item ids are checked against the entry so one meal can never alter another's items.
export async function updateEntry(
  entryId: number,
  changes: {
    timestamp?: string;
    mealType?: MealType;
    items?: { id: number; name?: string; portionMultiplier: number; nutrients: NutrientProfile }[];
    removedItemIds?: number[];
    // Foods the reader missed, typed in by hand on an already-saved meal.
    addedItems?: { item: DetectedFoodItem; portionMultiplier: number }[];
  }
): Promise<void> {
  if (Platform.OS === 'web') {
    return updateEntryWeb(entryId, changes);
  }
  const db = await getDatabase();
  if (changes.timestamp !== undefined) {
    await db.runAsync('UPDATE entries SET timestamp = ? WHERE id = ?;', [changes.timestamp, entryId]);
  }
  if (changes.mealType !== undefined) {
    await db.runAsync('UPDATE entries SET meal_type = ? WHERE id = ?;', [changes.mealType, entryId]);
  }
  for (const item of changes.items ?? []) {
    await db.runAsync(
      `UPDATE items SET portion_multiplier = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
        saturated_fat_g = ?, fiber_g = ?, sugar_g = ?, sodium_mg = ?, cholesterol_mg = ?, added_sugar_g = ?
       WHERE id = ? AND entry_id = ?;`,
      buildItemUpdateParams(entryId, item)
    );
  }
  for (const item of changes.items ?? []) {
    if (item.name !== undefined) {
      await db.runAsync('UPDATE items SET name = ? WHERE id = ? AND entry_id = ?;', [item.name, item.id, entryId]);
    }
  }
  for (const itemId of changes.removedItemIds ?? []) {
    await db.runAsync('DELETE FROM items WHERE id = ? AND entry_id = ?;', [itemId, entryId]);
  }
  for (const { item, portionMultiplier } of changes.addedItems ?? []) {
    await db.runAsync(
      `INSERT INTO items (
        entry_id, name, confidence, portion_multiplier,
        calories, protein_g, carbs_g, fat_g, saturated_fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, added_sugar_g
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      buildItemInsertParams(entryId, item, portionMultiplier)
    );
  }
}

// The local calendar day of the earliest saved meal, or null when nothing is logged yet.
export async function getFirstEntryDate(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getFirstEntryDateWeb();
  }
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT timestamp FROM entries ORDER BY timestamp ASC LIMIT 1;');
  if (rows.length === 0) return null;
  return toDateKey(new Date((rows[0] as any).timestamp));
}
