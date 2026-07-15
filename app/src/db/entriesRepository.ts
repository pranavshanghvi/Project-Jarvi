import { getDatabase } from './client';
import { DetectedFoodItem, MealType, NutrientProfile } from '../types/nutrition';

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
    },
  };
}

export async function createEntry(
  photoPath: string,
  mealType: MealType,
  itemsWithPortions: { item: DetectedFoodItem; portionMultiplier: number }[]
): Promise<number> {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();
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
        calories, protein_g, carbs_g, fat_g, saturated_fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    "SELECT * FROM entries WHERE substr(timestamp, 1, 10) = ? ORDER BY timestamp ASC;",
    [dateKey]
  );
  return fetchEntriesWithItems(rows);
}

export async function getEntriesInRange(startKey: string, endKey: string): Promise<StoredEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    "SELECT * FROM entries WHERE substr(timestamp, 1, 10) BETWEEN ? AND ? ORDER BY timestamp ASC;",
    [startKey, endKey]
  );
  return fetchEntriesWithItems(rows);
}
