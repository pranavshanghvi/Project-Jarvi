import { completeNutrients, DetectedFoodItem, MealType, NutrientProfile } from '../types/nutrition';
import { toDateKey } from '../nutrition/aggregation';
import { StoredEntry } from './entriesRepository';

const STORAGE_KEY = 'jarvi.entries.web';
const NEXT_ID_KEY = 'jarvi.nextId.web';

function readAll(): StoredEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  const entries: StoredEntry[] = raw ? JSON.parse(raw) : [];
  // Meals saved before added sugar existed have no value for it.
  for (const entry of entries) for (const item of entry.items) item.nutrients = completeNutrients(item.nutrients);
  return entries;
}

// A browser gives a site only a few megabytes. If saving fails for lack of room, keep every meal
// and its numbers but let go of the pictures on the older half, then try once more. Losing an old
// thumbnail is far better than refusing to save today's meal.
function writeAll(entries: StoredEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    const byAge = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const entry of byAge.slice(0, Math.ceil(byAge.length / 2))) entry.photoPath = '';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
}

function nextId(): number {
  const current = Number(localStorage.getItem(NEXT_ID_KEY) ?? '1');
  localStorage.setItem(NEXT_ID_KEY, String(current + 1));
  return current;
}

export async function createEntryWeb(
  photoPath: string,
  mealType: MealType,
  itemsWithPortions: { item: DetectedFoodItem; portionMultiplier: number }[],
  eatenAt: Date = new Date()
): Promise<number> {
  const entries = readAll();
  const entryId = nextId();
  const timestamp = eatenAt.toISOString();
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

export async function getEntryWeb(entryId: number): Promise<StoredEntry | null> {
  return readAll().find((e) => e.id === entryId) ?? null;
}

export async function deleteEntryWeb(entryId: number): Promise<void> {
  writeAll(readAll().filter((e) => e.id !== entryId));
}

export async function updateEntryWeb(
  entryId: number,
  changes: {
    timestamp?: string;
    mealType?: MealType;
    items?: { id: number; name?: string; portionMultiplier: number; nutrients: NutrientProfile }[];
    removedItemIds?: number[];
    addedItems?: { item: DetectedFoodItem; portionMultiplier: number }[];
  }
): Promise<void> {
  const entries = readAll();
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  if (changes.timestamp !== undefined) entry.timestamp = changes.timestamp;
  if (changes.mealType !== undefined) entry.mealType = changes.mealType;
  for (const change of changes.items ?? []) {
    const item = entry.items.find((i) => i.id === change.id);
    if (item) {
      item.portionMultiplier = change.portionMultiplier;
      item.nutrients = change.nutrients;
      if (change.name !== undefined) item.name = change.name;
    }
  }
  if (changes.removedItemIds?.length) {
    entry.items = entry.items.filter((i) => !changes.removedItemIds!.includes(i.id));
  }
  for (const { item, portionMultiplier } of changes.addedItems ?? []) {
    entry.items.push({ id: nextId(), entryId, name: item.name, confidence: item.confidence, portionMultiplier, nutrients: item.nutrients });
  }
  writeAll(entries);
}

export async function getFirstEntryDateWeb(): Promise<string | null> {
  const all = readAll();
  if (all.length === 0) return null;
  const earliest = all.reduce((a, b) => (new Date(b.timestamp) < new Date(a.timestamp) ? b : a));
  return toDateKey(new Date(earliest.timestamp));
}
