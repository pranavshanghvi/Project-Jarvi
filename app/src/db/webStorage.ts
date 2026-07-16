import { DetectedFoodItem, MealType } from '../types/nutrition';
import { StoredEntry } from './entriesRepository';

const STORAGE_KEY = 'jarvi.entries.web';
const NEXT_ID_KEY = 'jarvi.nextId.web';

function readAll(): StoredEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeAll(entries: StoredEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function nextId(): number {
  const current = Number(localStorage.getItem(NEXT_ID_KEY) ?? '1');
  localStorage.setItem(NEXT_ID_KEY, String(current + 1));
  return current;
}

export async function createEntryWeb(
  photoPath: string,
  mealType: MealType,
  itemsWithPortions: { item: DetectedFoodItem; portionMultiplier: number }[]
): Promise<number> {
  const entries = readAll();
  const entryId = nextId();
  const timestamp = new Date().toISOString();
  entries.push({
    id: entryId,
    timestamp,
    mealType,
    photoPath,
    items: itemsWithPortions.map(({ item, portionMultiplier }) => ({
      id: nextId(),
      entryId,
      name: item.name,
      confidence: item.confidence,
      portionMultiplier,
      nutrients: item.nutrients,
    })),
  });
  writeAll(entries);
  return entryId;
}

export async function getEntriesForDateWeb(dateKey: string): Promise<StoredEntry[]> {
  const [year, month, day] = dateKey.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return readAll()
    .filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= startOfDay.getTime() && t < endOfDay.getTime();
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getEntriesInRangeWeb(startKey: string, endKey: string): Promise<StoredEntry[]> {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const startOfRange = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const endOfRange = new Date(ey, em - 1, ed + 1, 0, 0, 0, 0);
  return readAll()
    .filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= startOfRange.getTime() && t < endOfRange.getTime();
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function updateMealTypeWeb(entryId: number, mealType: MealType): Promise<void> {
  const entries = readAll();
  const entry = entries.find((e) => e.id === entryId);
  if (entry) {
    entry.mealType = mealType;
    writeAll(entries);
  }
}
