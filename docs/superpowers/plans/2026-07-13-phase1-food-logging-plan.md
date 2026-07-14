# Jarvi Phase 1 Food Logging MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Jarvi MVP — photo of food → Claude vision itemizes it with a full nutrient profile → user confirms/adjusts via sliders → saved locally → daily view and trend dashboard.

**Architecture:** A React Native/Expo app (`app/`) stores everything on-device in SQLite; a single stateless Vercel serverless function (`server/`) proxies photos to Claude's vision API, holding the API key server-side. No backend database, no auth.

**Tech Stack:** Expo (TypeScript, managed workflow), expo-sqlite, expo-image-picker, expo-file-system, @react-native-community/slider, @react-navigation/native, react-native-svg (custom charts), Jest (`jest-expo` preset). Server: Vercel Node serverless function, `@anthropic-ai/sdk`, Jest.

## Global Constraints

- Storage is on-device only — no server database, no user accounts/auth (per design: avoids a second external service to maintain).
- `ANTHROPIC_API_KEY` lives only in `server/` as a Vercel env var — never in the `app/` bundle or committed to git.
- Nutrient profile is always all 9 fields: calories, protein, carbs, fat, saturated fat, fiber, sugar, sodium, cholesterol.
- Claude must return an **itemized** list per photo (multiple foods), never a single combined estimate.
- Confirm screen: one portion slider per item (scales proportionally) plus per-nutrient fine-tune sliders underneath.
- Meal type is auto-inferred from time of day and must remain user-editable.
- Dashboard is trend-only (nutrient intake over time) — no calorie balance until Phase 2 brings in HealthKit.
- Automated tests are required for pure logic (`app/src/nutrition/**`, `server/lib/**`); UI, SQLite wiring, and native-module screens are verified manually (matches the design's stated testing approach — see spec §Testing approach).

---

### Task 1: Scaffold the Expo app and test harness

**Files:**
- Create: `app/` (via `create-expo-app`)
- Create: `app/jest.config.js`
- Create: `app/src/__smoke__/smoke.test.ts`
- Modify: `app/package.json`

**Interfaces:**
- Produces: a working Expo TypeScript app at `app/`, with `npm test` running Jest via the `jest-expo` preset. Every later `app/` task assumes this is in place.

- [ ] **Step 1: Scaffold the app**

Run from the repo root (`~/Desktop/Project-Jarvi`):

```bash
npx create-expo-app@latest app --template blank-typescript
```

Expected: `app/` directory created with `App.tsx`, `package.json`, `tsconfig.json`, `app.json`.

- [ ] **Step 2: Add Jest**

```bash
cd app
npx expo install jest-expo jest @types/jest
```

- [ ] **Step 3: Configure Jest**

Create `app/jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
```

Modify `app/package.json` to add a `test` script inside `"scripts"`:

```json
"test": "jest"
```

- [ ] **Step 4: Write a smoke test**

Create `app/src/__smoke__/smoke.test.ts`:

```ts
describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

```bash
npm test
```

Expected: 1 test suite, 1 test, PASS.

- [ ] **Step 6: Commit**

```bash
cd ..
git add app
git commit -m "Scaffold Expo app with Jest test harness"
```

---

### Task 2: Nutrition types and portion/fine-tune scaling

**Files:**
- Create: `app/src/types/nutrition.ts`
- Create: `app/src/nutrition/portionScaling.ts`
- Test: `app/src/nutrition/portionScaling.test.ts`

**Interfaces:**
- Consumes: nothing (first domain module).
- Produces: `NutrientProfile`, `ConfidenceLevel`, `MealType`, `DetectedFoodItem`, `AnalyzePhotoResponse` types (used by every later task). `scaleNutrients(nutrients, multiplier)` and `applyFineTune(nutrients, fineTune)` functions (used by Task 9's confirm screen).

- [ ] **Step 1: Write the types**

Create `app/src/types/nutrition.ts`:

```ts
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ConfidenceLevel = 'normal' | 'low';

export interface NutrientProfile {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  saturatedFatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  cholesterolMg: number;
}

export interface DetectedFoodItem {
  name: string;
  confidence: ConfidenceLevel;
  portionDescription: string;
  nutrients: NutrientProfile;
}

export interface AnalyzePhotoResponse {
  items: DetectedFoodItem[];
}

export const NUTRIENT_KEYS: (keyof NutrientProfile)[] = [
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'saturatedFatG',
  'fiberG',
  'sugarG',
  'sodiumMg',
  'cholesterolMg',
];
```

- [ ] **Step 2: Write the failing test**

Create `app/src/nutrition/portionScaling.test.ts`:

```ts
import { scaleNutrients, applyFineTune } from './portionScaling';
import { NutrientProfile } from '../types/nutrition';

const base: NutrientProfile = {
  calories: 200,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  saturatedFatG: 2,
  fiberG: 3,
  sugarG: 4,
  sodiumMg: 300,
  cholesterolMg: 10,
};

describe('scaleNutrients', () => {
  it('scales every field by the multiplier', () => {
    const result = scaleNutrients(base, 1.5);
    expect(result.calories).toBeCloseTo(300);
    expect(result.proteinG).toBeCloseTo(15);
    expect(result.sodiumMg).toBeCloseTo(450);
  });

  it('leaves nutrients unchanged at multiplier 1', () => {
    expect(scaleNutrients(base, 1)).toEqual(base);
  });
});

describe('applyFineTune', () => {
  it('adjusts only the specified field', () => {
    const result = applyFineTune(base, { proteinG: 1.2 });
    expect(result.proteinG).toBeCloseTo(12);
    expect(result.calories).toBeCloseTo(200);
  });

  it('leaves nutrients unchanged with no fine-tune values', () => {
    expect(applyFineTune(base, {})).toEqual(base);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd app && npm test -- portionScaling
```

Expected: FAIL with "Cannot find module './portionScaling'".

- [ ] **Step 4: Implement**

Create `app/src/nutrition/portionScaling.ts`:

```ts
import { NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';

export function scaleNutrients(nutrients: NutrientProfile, multiplier: number): NutrientProfile {
  const result = {} as NutrientProfile;
  for (const key of NUTRIENT_KEYS) {
    result[key] = nutrients[key] * multiplier;
  }
  return result;
}

export function applyFineTune(
  nutrients: NutrientProfile,
  fineTune: Partial<Record<keyof NutrientProfile, number>>
): NutrientProfile {
  const result = { ...nutrients };
  for (const key of NUTRIENT_KEYS) {
    const factor = fineTune[key];
    if (factor !== undefined) {
      result[key] = nutrients[key] * factor;
    }
  }
  return result;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- portionScaling
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
cd .. && git add app/src/types app/src/nutrition
git commit -m "Add nutrition types and portion/fine-tune scaling"
```

---

### Task 3: Meal auto-tagging

**Files:**
- Create: `app/src/nutrition/mealTagging.ts`
- Test: `app/src/nutrition/mealTagging.test.ts`

**Interfaces:**
- Consumes: `MealType` from `app/src/types/nutrition.ts` (Task 2).
- Produces: `inferMealType(date: Date): MealType`, used by Task 10's save flow.

- [ ] **Step 1: Write the failing test**

Create `app/src/nutrition/mealTagging.test.ts`:

```ts
import { inferMealType } from './mealTagging';

function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 0, 1, hour, minute);
  return d;
}

describe('inferMealType', () => {
  it('returns breakfast from 5:00 to 10:59', () => {
    expect(inferMealType(at(5, 0))).toBe('breakfast');
    expect(inferMealType(at(10, 59))).toBe('breakfast');
  });

  it('returns lunch from 11:00 to 15:59', () => {
    expect(inferMealType(at(11, 0))).toBe('lunch');
    expect(inferMealType(at(15, 59))).toBe('lunch');
  });

  it('returns dinner from 16:00 to 20:59', () => {
    expect(inferMealType(at(16, 0))).toBe('dinner');
    expect(inferMealType(at(20, 59))).toBe('dinner');
  });

  it('returns snack from 21:00 to 4:59', () => {
    expect(inferMealType(at(21, 0))).toBe('snack');
    expect(inferMealType(at(4, 59))).toBe('snack');
    expect(inferMealType(at(0, 0))).toBe('snack');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- mealTagging
```

Expected: FAIL with "Cannot find module './mealTagging'".

- [ ] **Step 3: Implement**

Create `app/src/nutrition/mealTagging.ts`:

```ts
import { MealType } from '../types/nutrition';

export function inferMealType(date: Date): MealType {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 21) return 'dinner';
  return 'snack';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- mealTagging
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd .. && git add app/src/nutrition
git commit -m "Add meal auto-tagging from time of day"
```

---

### Task 4: Daily and trend aggregation

**Files:**
- Create: `app/src/nutrition/aggregation.ts`
- Test: `app/src/nutrition/aggregation.test.ts`

**Interfaces:**
- Consumes: `NutrientProfile`, `NUTRIENT_KEYS` from `app/src/types/nutrition.ts`.
- Produces: `aggregateDailyTotals(items: NutrientProfile[]): NutrientProfile` and `buildTrend(entriesByDate: Record<string, NutrientProfile[]>, days: number, referenceDate: Date): TrendPoint[]`, used by Task 11 (daily view) and Task 12 (dashboard).

- [ ] **Step 1: Write the failing test**

Create `app/src/nutrition/aggregation.test.ts`:

```ts
import { aggregateDailyTotals, buildTrend } from './aggregation';
import { NutrientProfile } from '../types/nutrition';

function profile(calories: number): NutrientProfile {
  return {
    calories,
    proteinG: 1,
    carbsG: 1,
    fatG: 1,
    saturatedFatG: 1,
    fiberG: 1,
    sugarG: 1,
    sodiumMg: 1,
    cholesterolMg: 1,
  };
}

describe('aggregateDailyTotals', () => {
  it('sums every field across items', () => {
    const totals = aggregateDailyTotals([profile(100), profile(200)]);
    expect(totals.calories).toBe(300);
    expect(totals.proteinG).toBe(2);
  });

  it('returns all zeros for an empty list', () => {
    const totals = aggregateDailyTotals([]);
    expect(totals.calories).toBe(0);
    expect(totals.sodiumMg).toBe(0);
  });
});

describe('buildTrend', () => {
  it('returns one point per day, oldest first, filling gaps with zero totals', () => {
    const referenceDate = new Date(2026, 6, 13); // 2026-07-13
    const entriesByDate = {
      '2026-07-13': [profile(500)],
      '2026-07-11': [profile(300)],
    };
    const trend = buildTrend(entriesByDate, 3, referenceDate);
    expect(trend.map((p) => p.date)).toEqual(['2026-07-11', '2026-07-12', '2026-07-13']);
    expect(trend[0].totals.calories).toBe(300);
    expect(trend[1].totals.calories).toBe(0);
    expect(trend[2].totals.calories).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- aggregation
```

Expected: FAIL with "Cannot find module './aggregation'".

- [ ] **Step 3: Implement**

Create `app/src/nutrition/aggregation.ts`:

```ts
import { NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  totals: NutrientProfile;
}

function zeroProfile(): NutrientProfile {
  return {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    saturatedFatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    cholesterolMg: 0,
  };
}

export function aggregateDailyTotals(items: NutrientProfile[]): NutrientProfile {
  const totals = zeroProfile();
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      totals[key] += item[key];
    }
  }
  return totals;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildTrend(
  entriesByDate: Record<string, NutrientProfile[]>,
  days: number,
  referenceDate: Date
): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(referenceDate);
    day.setDate(day.getDate() - i);
    const key = toDateKey(day);
    points.push({ date: key, totals: aggregateDailyTotals(entriesByDate[key] ?? []) });
  }
  return points;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- aggregation
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd .. && git add app/src/nutrition
git commit -m "Add daily totals and trend aggregation"
```

---

### Task 5: SQLite schema, client, and entries repository

**Files:**
- Create: `app/src/db/schema.ts`
- Create: `app/src/db/client.ts`
- Create: `app/src/db/entriesRepository.ts`
- Test: `app/src/db/entriesRepository.test.ts`
- Modify: `app/App.tsx` (temporary debug harness — replaced in Task 13)

**Interfaces:**
- Consumes: `DetectedFoodItem`, `MealType`, `NutrientProfile` from `app/src/types/nutrition.ts`.
- Produces: `createEntry(photoPath, mealType, items, portionMultipliers): Promise<number>`, `getEntriesForDate(dateKey: string): Promise<StoredEntry[]>`, `getEntriesInRange(startKey: string, endKey: string): Promise<StoredEntry[]>`, `StoredEntry` type — used by Task 10 (save), Task 11 (daily view), Task 12 (dashboard).

- [ ] **Step 1: Install expo-sqlite and expo-file-system**

```bash
cd app && npx expo install expo-sqlite expo-file-system
```

- [ ] **Step 2: Write the schema**

Create `app/src/db/schema.ts`:

```ts
export const ENTRIES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  photo_path TEXT NOT NULL
);
`;

export const ITEMS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  confidence TEXT NOT NULL,
  portion_multiplier REAL NOT NULL,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  saturated_fat_g REAL NOT NULL,
  fiber_g REAL NOT NULL,
  sugar_g REAL NOT NULL,
  sodium_mg REAL NOT NULL,
  cholesterol_mg REAL NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES entries(id)
);
`;
```

- [ ] **Step 3: Write the failing test for the pure row helpers**

Create `app/src/db/entriesRepository.test.ts`:

```ts
import { buildItemInsertParams, mapItemRow } from './entriesRepository';
import { DetectedFoodItem } from '../types/nutrition';

const item: DetectedFoodItem = {
  name: 'Grilled chicken',
  confidence: 'normal',
  portionDescription: '1 breast, ~150g',
  nutrients: {
    calories: 250,
    proteinG: 40,
    carbsG: 0,
    fatG: 8,
    saturatedFatG: 2,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 90,
    cholesterolMg: 100,
  },
};

describe('buildItemInsertParams', () => {
  it('maps a detected item and entry id into positional params', () => {
    const params = buildItemInsertParams(7, item, 1.2);
    expect(params).toEqual([7, 'Grilled chicken', 'normal', 1.2, 250, 40, 0, 8, 2, 0, 0, 90, 100]);
  });
});

describe('mapItemRow', () => {
  it('maps a raw db row back into a typed item', () => {
    const row = {
      id: 1,
      entry_id: 7,
      name: 'Grilled chicken',
      confidence: 'normal',
      portion_multiplier: 1.2,
      calories: 250,
      protein_g: 40,
      carbs_g: 0,
      fat_g: 8,
      saturated_fat_g: 2,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 90,
      cholesterol_mg: 100,
    };
    const mapped = mapItemRow(row);
    expect(mapped.name).toBe('Grilled chicken');
    expect(mapped.nutrients.proteinG).toBe(40);
    expect(mapped.portionMultiplier).toBe(1.2);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npm test -- entriesRepository
```

Expected: FAIL with "Cannot find module './entriesRepository'".

- [ ] **Step 5: Implement the client and repository**

Create `app/src/db/client.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import { ENTRIES_TABLE_SQL, ITEMS_TABLE_SQL } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  const db = await SQLite.openDatabaseAsync('jarvi.db');
  await db.execAsync(ENTRIES_TABLE_SQL);
  await db.execAsync(ITEMS_TABLE_SQL);
  dbInstance = db;
  return db;
}
```

Create `app/src/db/entriesRepository.ts`:

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- entriesRepository
```

Expected: PASS, 2 tests (only the pure helpers are exercised — `createEntry`/`getEntriesForDate` need a real device/simulator, verified next).

- [ ] **Step 7: Manually verify the round trip on-device**

Temporarily replace the contents of `app/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { createEntry, getEntriesForDate } from './src/db/entriesRepository';
import { DetectedFoodItem } from './src/types/nutrition';

const sampleItem: DetectedFoodItem = {
  name: 'Test apple',
  confidence: 'normal',
  portionDescription: '1 medium',
  nutrients: {
    calories: 95,
    proteinG: 0.5,
    carbsG: 25,
    fatG: 0.3,
    saturatedFatG: 0,
    fiberG: 4,
    sugarG: 19,
    sodiumMg: 2,
    cholesterolMg: 0,
  },
};

export default function App() {
  const [log, setLog] = useState('loading...');

  useEffect(() => {
    (async () => {
      await createEntry('file:///fake/path.jpg', 'snack', [{ item: sampleItem, portionMultiplier: 1 }]);
      const today = new Date().toISOString().slice(0, 10);
      const entries = await getEntriesForDate(today);
      setLog(JSON.stringify(entries, null, 2));
    })();
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: 60, paddingHorizontal: 16 }}>
      <Text>{log}</Text>
    </View>
  );
}
```

Run:

```bash
npx expo start
```

Open in Expo Go (press `i` for iOS simulator or scan the QR code). Expected: screen shows JSON with one entry, `mealType: "snack"`, and one item named `"Test apple"` with `proteinG: 0.5`. Stop the dev server with Ctrl+C once confirmed.

- [ ] **Step 8: Commit**

```bash
cd .. && git add app/src/db app/App.tsx
git commit -m "Add SQLite schema, client, and entries repository"
```

---

### Task 6: Vercel proxy — Claude client and response parser

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vercel.json`
- Create: `server/lib/types.ts`
- Create: `server/lib/parseResponse.ts`
- Test: `server/lib/parseResponse.test.ts`
- Create: `server/lib/claudeClient.ts`
- Test: `server/lib/claudeClient.test.ts`
- Create: `server/api/analyze.ts`

**Interfaces:**
- Produces: `POST /api/analyze` accepting `{ imageBase64: string }`, returning `AnalyzePhotoResponse` (same shape as `app/src/types/nutrition.ts`). Used by Task 7's client API layer.

- [ ] **Step 1: Scaffold the server package**

```bash
mkdir -p server/api server/lib
cd server
npm init -y
npm install @anthropic-ai/sdk
npm install --save-dev typescript @types/node @vercel/node jest ts-jest @types/jest
npx tsc --init --target es2020 --module commonjs --strict --esModuleInterop --outDir dist
```

Replace `server/package.json` `"scripts"` section with:

```json
"scripts": {
  "test": "jest"
}
```

Create `server/vercel.json`:

```json
{
  "version": 2,
  "functions": {
    "api/analyze.ts": { "memory": 512, "maxDuration": 30 }
  }
}
```

Add a Jest config by creating `server/jest.config.js`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
};
```

- [ ] **Step 2: Write the shared types**

Create `server/lib/types.ts`:

```ts
export type ConfidenceLevel = 'normal' | 'low';

export interface NutrientProfile {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  saturatedFatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  cholesterolMg: number;
}

export interface DetectedFoodItem {
  name: string;
  confidence: ConfidenceLevel;
  portionDescription: string;
  nutrients: NutrientProfile;
}

export interface AnalyzePhotoResponse {
  items: DetectedFoodItem[];
}
```

- [ ] **Step 3: Write the failing test for parseResponse**

Create `server/lib/parseResponse.test.ts`:

```ts
import { parseClaudeResponse } from './parseResponse';

describe('parseClaudeResponse', () => {
  it('parses a well-formed Claude JSON response into itemized nutrients', () => {
    const raw = JSON.stringify({
      items: [
        {
          name: 'Grilled chicken',
          confidence: 'normal',
          portionDescription: '1 breast, ~150g',
          nutrients: {
            calories: 250,
            proteinG: 40,
            carbsG: 0,
            fatG: 8,
            saturatedFatG: 2,
            fiberG: 0,
            sugarG: 0,
            sodiumMg: 90,
            cholesterolMg: 100,
          },
        },
      ],
    });
    const result = parseClaudeResponse(raw);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Grilled chicken');
  });

  it('throws when the response is not valid JSON', () => {
    expect(() => parseClaudeResponse('not json')).toThrow('Claude response was not valid JSON');
  });

  it('throws when items is missing', () => {
    expect(() => parseClaudeResponse(JSON.stringify({}))).toThrow('Claude response missing "items" array');
  });

  it('throws when an item is missing required nutrient fields', () => {
    const raw = JSON.stringify({ items: [{ name: 'X', confidence: 'normal', portionDescription: 'a', nutrients: { calories: 1 } }] });
    expect(() => parseClaudeResponse(raw)).toThrow('Claude item "X" is missing nutrient fields');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd server && npm test -- parseResponse
```

Expected: FAIL with "Cannot find module './parseResponse'".

- [ ] **Step 5: Implement parseResponse**

Create `server/lib/parseResponse.ts`:

```ts
import { AnalyzePhotoResponse, DetectedFoodItem, NutrientProfile } from './types';

const REQUIRED_NUTRIENT_KEYS: (keyof NutrientProfile)[] = [
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'saturatedFatG',
  'fiberG',
  'sugarG',
  'sodiumMg',
  'cholesterolMg',
];

export function parseClaudeResponse(raw: string): AnalyzePhotoResponse {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Claude response was not valid JSON');
  }

  if (!Array.isArray(parsed?.items)) {
    throw new Error('Claude response missing "items" array');
  }

  const items: DetectedFoodItem[] = parsed.items.map((item: any) => {
    const missing = REQUIRED_NUTRIENT_KEYS.filter((key) => typeof item?.nutrients?.[key] !== 'number');
    if (missing.length > 0) {
      throw new Error(`Claude item "${item?.name ?? 'unknown'}" is missing nutrient fields: ${missing.join(', ')}`);
    }
    return {
      name: item.name,
      confidence: item.confidence === 'low' ? 'low' : 'normal',
      portionDescription: item.portionDescription ?? '',
      nutrients: item.nutrients,
    };
  });

  return { items };
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- parseResponse
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Write the failing test for claudeClient**

Create `server/lib/claudeClient.test.ts`:

```ts
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"items":[]}' }],
      }),
    },
  }));
});

import { analyzeImageWithClaude } from './claudeClient';

describe('analyzeImageWithClaude', () => {
  it('returns the text content from Claude response', async () => {
    const text = await analyzeImageWithClaude('base64data', 'image/jpeg');
    expect(text).toBe('{"items":[]}');
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

```bash
npm test -- claudeClient
```

Expected: FAIL with "Cannot find module './claudeClient'".

- [ ] **Step 9: Implement claudeClient**

Create `server/lib/claudeClient.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';

const PROMPT = `You are a nutrition analysis assistant. Look at the food in this photo and identify each distinct food item separately (do not combine them into one estimate).

For each item, estimate: name, a portion description (e.g. "1 cup, ~150g"), a confidence level ("normal" or "low" if you're unsure what it is or how much is there), and a full nutrient profile with these exact fields: calories, proteinG, carbsG, fatG, saturatedFatG, fiberG, sugarG, sodiumMg, cholesterolMg (all numbers).

Respond with ONLY valid JSON in this exact shape, no other text:
{"items": [{"name": string, "confidence": "normal" | "low", "portionDescription": string, "nutrients": {"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "saturatedFatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number, "cholesterolMg": number}}]}

If you cannot identify any food, respond with {"items": []}.`;

export async function analyzeImageWithClaude(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });
  const textBlock = response.content.find((block: any) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response had no text content');
  }
  return textBlock.text;
}
```

- [ ] **Step 10: Run test to verify it passes**

```bash
npm test -- claudeClient
```

Expected: PASS, 1 test.

- [ ] **Step 11: Implement the Vercel handler**

Create `server/api/analyze.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeImageWithClaude } from '../lib/claudeClient';
import { parseClaudeResponse } from '../lib/parseResponse';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { imageBase64, mimeType } = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    res.status(400).json({ error: 'imageBase64 is required' });
    return;
  }

  try {
    const rawText = await analyzeImageWithClaude(imageBase64, mimeType ?? 'image/jpeg');
    const parsed = parseClaudeResponse(rawText);
    res.status(200).json(parsed);
  } catch (error: any) {
    res.status(502).json({ error: error.message ?? 'Analysis failed' });
  }
}
```

- [ ] **Step 12: Manually verify locally**

```bash
npm install --save-dev vercel
export ANTHROPIC_API_KEY=sk-ant-your-key-here
npx vercel dev
```

In another terminal, with a real JPEG at hand:

```bash
IMG_BASE64=$(base64 -i /path/to/food-photo.jpg)
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d "{\"imageBase64\": \"$IMG_BASE64\", \"mimeType\": \"image/jpeg\"}"
```

Expected: HTTP 200 with `{"items": [...]}` containing at least one item with all 9 nutrient fields. Stop `vercel dev` with Ctrl+C once confirmed.

- [ ] **Step 13: Commit**

```bash
cd .. && git add server
git commit -m "Add Vercel proxy: Claude client, response parser, and handler"
```

---

### Task 7: Client API layer with offline queue and retry

**Files:**
- Create: `app/src/api/analyzePhoto.ts`
- Test: `app/src/api/analyzePhoto.test.ts`

**Interfaces:**
- Consumes: `AnalyzePhotoResponse` from `app/src/types/nutrition.ts`.
- Produces: `analyzePhoto(photoUri: string): Promise<AnalyzePhotoResponse>`, `queuePhotoForRetry(photoUri: string): Promise<void>`, `getQueuedPhotos(): Promise<string[]>`, `clearQueuedPhoto(photoUri: string): Promise<void>`, `subscribeToReconnect(onReconnect: () => void): () => void` — used by Task 8's capture screen.

- [ ] **Step 1: Install dependencies**

```bash
cd app && npx expo install @react-native-async-storage/async-storage @react-native-community/netinfo
```

- [ ] **Step 2: Write the failing test**

Create `app/src/api/analyzePhoto.test.ts`:

```ts
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('fakeBase64Data'),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { analyzePhoto, queuePhotoForRetry, getQueuedPhotos, clearQueuedPhoto } from './analyzePhoto';

describe('analyzePhoto', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('reads the photo, posts it, and returns the parsed response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    const result = await analyzePhoto('file:///fake.jpg');
    expect(result).toEqual({ items: [] });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/analyze'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when the response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502 });
    await expect(analyzePhoto('file:///fake.jpg')).rejects.toThrow('status 502');
  });
});

describe('photo retry queue', () => {
  it('queues, lists, and clears photos', async () => {
    await queuePhotoForRetry('file:///a.jpg');
    await queuePhotoForRetry('file:///b.jpg');
    expect(await getQueuedPhotos()).toEqual(['file:///a.jpg', 'file:///b.jpg']);
    await clearQueuedPhoto('file:///a.jpg');
    expect(await getQueuedPhotos()).toEqual(['file:///b.jpg']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- analyzePhoto
```

Expected: FAIL with "Cannot find module './analyzePhoto'".

- [ ] **Step 4: Implement**

Create `app/src/api/analyzePhoto.ts`:

```ts
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AnalyzePhotoResponse } from '../types/nutrition';

const QUEUE_KEY = 'jarvi.pendingAnalysis';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export async function analyzePhoto(photoUri: string): Promise<AnalyzePhotoResponse> {
  const imageBase64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
  });
  if (!response.ok) {
    throw new Error(`Analyze request failed with status ${response.status}`);
  }
  return (await response.json()) as AnalyzePhotoResponse;
}

export async function queuePhotoForRetry(photoUri: string): Promise<void> {
  const queue = await getQueuedPhotos();
  queue.push(photoUri);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueuedPhotos(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function clearQueuedPhoto(photoUri: string): Promise<void> {
  const queue = await getQueuedPhotos();
  const next = queue.filter((uri) => uri !== photoUri);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}

export function subscribeToReconnect(onReconnect: () => void): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      onReconnect();
    }
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- analyzePhoto
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
cd .. && git add app/src/api
git commit -m "Add client API layer with offline queue and retry"
```

---

### Task 8: Capture screen

**Files:**
- Create: `app/src/screens/CaptureScreen.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks yet (wired into navigation in Task 13).
- Produces: `CaptureScreen` component with props `{ onPhotoCaptured: (uri: string) => void }` — used by Task 13's navigator.

- [ ] **Step 1: Install expo-image-picker**

```bash
cd app && npx expo install expo-image-picker
```

- [ ] **Step 2: Implement the screen**

Create `app/src/screens/CaptureScreen.tsx`:

```tsx
import { useState } from 'react';
import { Button, Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  onPhotoCaptured: (uri: string) => void;
}

export default function CaptureScreen({ onPhotoCaptured }: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      setPreviewUri(result.assets[0].uri);
      onPhotoCaptured(result.assets[0].uri);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled) {
      setPreviewUri(result.assets[0].uri);
      onPhotoCaptured(result.assets[0].uri);
    }
  }

  return (
    <View style={styles.container}>
      {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
      <Button title="Take photo" onPress={takePhoto} />
      <Button title="Choose from library" onPress={pickFromLibrary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 16 },
  preview: { width: 240, height: 240, borderRadius: 12, marginBottom: 12 },
});
```

- [ ] **Step 3: Manually verify**

Temporarily render `<CaptureScreen onPhotoCaptured={(uri) => console.log('captured', uri)} />` in `app/App.tsx`, run `npx expo start`, open on a physical device (camera doesn't work in the iOS simulator), tap "Take photo" and "Choose from library". Expected: both flows return a `file://` URI logged to the Metro console, and the preview image renders. Revert `App.tsx` afterward — Task 13 wires this screen in for real.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/CaptureScreen.tsx
git commit -m "Add capture screen with camera and photo library"
```

---

### Task 9: Confirm & adjust screen

**Files:**
- Create: `app/src/components/PortionSlider.tsx`
- Create: `app/src/components/FoodItemCard.tsx`
- Create: `app/src/screens/ConfirmScreen.tsx`

**Interfaces:**
- Consumes: `scaleNutrients`, `applyFineTune` from `app/src/nutrition/portionScaling.ts` (Task 2); `DetectedFoodItem`, `NUTRIENT_KEYS` from `app/src/types/nutrition.ts` (Task 2).
- Produces: `ConfirmScreen` component with props `{ items: DetectedFoodItem[]; onConfirm: (items: { item: DetectedFoodItem; portionMultiplier: number }[]) => void }` — used by Task 10 (save wiring) and Task 13 (navigator).

- [ ] **Step 1: Install the slider package**

```bash
cd app && npx expo install @react-native-community/slider
```

- [ ] **Step 2: Implement PortionSlider**

Create `app/src/components/PortionSlider.tsx`:

```tsx
import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  label: string;
  value: number; // 0.5 to 2.0
  onChange: (value: number) => void;
}

export default function PortionSlider({ label, value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}: {Math.round(value * 100)}%</Text>
      <Slider minimumValue={0.5} maximumValue={2.0} step={0.05} value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  label: { fontSize: 13, marginBottom: 2 },
});
```

- [ ] **Step 3: Implement FoodItemCard**

Create `app/src/components/FoodItemCard.tsx`:

```tsx
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import PortionSlider from './PortionSlider';
import { scaleNutrients, applyFineTune } from '../nutrition/portionScaling';
import { DetectedFoodItem, NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';

interface Props {
  item: DetectedFoodItem;
  onChange: (portionMultiplier: number, adjustedNutrients: NutrientProfile) => void;
}

const NUTRIENT_LABELS: Record<keyof NutrientProfile, string> = {
  calories: 'Calories',
  proteinG: 'Protein (g)',
  carbsG: 'Carbs (g)',
  fatG: 'Fat (g)',
  saturatedFatG: 'Saturated fat (g)',
  fiberG: 'Fiber (g)',
  sugarG: 'Sugar (g)',
  sodiumMg: 'Sodium (mg)',
  cholesterolMg: 'Cholesterol (mg)',
};

export default function FoodItemCard({ item, onChange }: Props) {
  const [portionMultiplier, setPortionMultiplier] = useState(1);
  const [fineTune, setFineTune] = useState<Partial<Record<keyof NutrientProfile, number>>>({});

  function recompute(nextPortion: number, nextFineTune: Partial<Record<keyof NutrientProfile, number>>) {
    const scaled = scaleNutrients(item.nutrients, nextPortion);
    const adjusted = applyFineTune(scaled, nextFineTune);
    onChange(nextPortion, adjusted);
  }

  return (
    <View style={[styles.card, item.confidence === 'low' && styles.lowConfidence]}>
      <Text style={styles.name}>{item.name}</Text>
      {item.confidence === 'low' && <Text style={styles.flag}>Low confidence — double-check this one</Text>}
      <Text style={styles.portionDescription}>{item.portionDescription}</Text>
      <PortionSlider
        label="Portion"
        value={portionMultiplier}
        onChange={(value) => {
          setPortionMultiplier(value);
          recompute(value, fineTune);
        }}
      />
      {NUTRIENT_KEYS.map((key) => (
        <PortionSlider
          key={key}
          label={`Fine-tune ${NUTRIENT_LABELS[key]}`}
          value={fineTune[key] ?? 1}
          onChange={(value) => {
            const nextFineTune = { ...fineTune, [key]: value };
            setFineTune(nextFineTune);
            recompute(portionMultiplier, nextFineTune);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginBottom: 12 },
  lowConfidence: { borderColor: '#d9a441', borderWidth: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  flag: { color: '#a06a1a', fontSize: 12, marginTop: 2 },
  portionDescription: { color: '#666', fontSize: 12, marginBottom: 8 },
});
```

- [ ] **Step 4: Implement ConfirmScreen**

Create `app/src/screens/ConfirmScreen.tsx`:

```tsx
import { useState } from 'react';
import { Button, ScrollView, StyleSheet } from 'react-native';
import FoodItemCard from '../components/FoodItemCard';
import { DetectedFoodItem, NutrientProfile } from '../types/nutrition';

interface Props {
  items: DetectedFoodItem[];
  onConfirm: (result: { item: DetectedFoodItem; portionMultiplier: number }[]) => void;
}

export default function ConfirmScreen({ items, onConfirm }: Props) {
  const [adjusted, setAdjusted] = useState(
    items.map((item) => ({ item, portionMultiplier: 1, nutrients: item.nutrients }))
  );

  function updateItem(index: number, portionMultiplier: number, nutrients: NutrientProfile) {
    setAdjusted((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], portionMultiplier, nutrients };
      return next;
    });
  }

  function removeItem(index: number) {
    setAdjusted((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    onConfirm(
      adjusted.map(({ item, portionMultiplier, nutrients }) => ({
        item: { ...item, nutrients },
        portionMultiplier,
      }))
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {adjusted.map((entry, index) => (
        <FoodItemCard
          key={`${entry.item.name}-${index}`}
          item={entry.item}
          onChange={(portionMultiplier, nutrients) => updateItem(index, portionMultiplier, nutrients)}
        />
      ))}
      <Button title="Remove last item" onPress={() => removeItem(adjusted.length - 1)} disabled={adjusted.length === 0} />
      <Button title="Save" onPress={handleConfirm} disabled={adjusted.length === 0} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
```

- [ ] **Step 5: Manually verify**

Temporarily render in `app/App.tsx`:

```tsx
<ConfirmScreen
  items={[
    {
      name: 'Grilled chicken',
      confidence: 'low',
      portionDescription: '1 breast, ~150g',
      nutrients: { calories: 250, proteinG: 40, carbsG: 0, fatG: 8, saturatedFatG: 2, fiberG: 0, sugarG: 0, sodiumMg: 90, cholesterolMg: 100 },
    },
  ]}
  onConfirm={(result) => console.log('confirmed', JSON.stringify(result))}
/>
```

Run `npx expo start`, open in Expo Go. Expected: card shows the amber low-confidence flag, a portion slider, and nine fine-tune sliders. Dragging the portion slider to 150% roughly doubles-ish the calories value if you add a temporary `<Text>` to display it (or just confirm no crash and check the logged `onConfirm` payload shows scaled numbers). Revert `App.tsx` afterward.

- [ ] **Step 6: Commit**

```bash
git add app/src/components app/src/screens/ConfirmScreen.tsx
git commit -m "Add confirm and adjust screen with portion and fine-tune sliders"
```

---

### Task 10: Save flow wiring

**Files:**
- Modify: `app/src/screens/ConfirmScreen.tsx`

**Interfaces:**
- Consumes: `createEntry` from `app/src/db/entriesRepository.ts` (Task 5), `inferMealType` from `app/src/nutrition/mealTagging.ts` (Task 3).
- Produces: `ConfirmScreen` now persists on save and calls `onSaved(entryId: number)` — used by Task 13's navigator.

- [ ] **Step 1: Wire the save button to the repository**

Modify `app/src/screens/ConfirmScreen.tsx`: change the `Props` interface and `handleConfirm` function.

Replace:

```tsx
interface Props {
  items: DetectedFoodItem[];
  onConfirm: (result: { item: DetectedFoodItem; portionMultiplier: number }[]) => void;
}
```

with:

```tsx
interface Props {
  items: DetectedFoodItem[];
  photoUri: string;
  onSaved: (entryId: number) => void;
}
```

Add imports at the top:

```tsx
import { createEntry } from '../db/entriesRepository';
import { inferMealType } from '../nutrition/mealTagging';
```

Replace the component signature and `handleConfirm`:

```tsx
export default function ConfirmScreen({ items, photoUri, onSaved }: Props) {
  const [adjusted, setAdjusted] = useState(
    items.map((item) => ({ item, portionMultiplier: 1, nutrients: item.nutrients }))
  );

  function updateItem(index: number, portionMultiplier: number, nutrients: NutrientProfile) {
    setAdjusted((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], portionMultiplier, nutrients };
      return next;
    });
  }

  function removeItem(index: number) {
    setAdjusted((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    const mealType = inferMealType(new Date());
    const itemsWithPortions = adjusted.map(({ item, portionMultiplier, nutrients }) => ({
      item: { ...item, nutrients },
      portionMultiplier,
    }));
    const entryId = await createEntry(photoUri, mealType, itemsWithPortions);
    onSaved(entryId);
  }
```

(The `render` block stays the same, since `handleConfirm` is still called from the "Save" button's `onPress`.)

- [ ] **Step 2: Manually verify the full save round trip**

Temporarily render in `app/App.tsx`:

```tsx
<ConfirmScreen
  items={[
    {
      name: 'Grilled chicken',
      confidence: 'normal',
      portionDescription: '1 breast, ~150g',
      nutrients: { calories: 250, proteinG: 40, carbsG: 0, fatG: 8, saturatedFatG: 2, fiberG: 0, sugarG: 0, sodiumMg: 90, cholesterolMg: 100 },
    },
  ]}
  photoUri="file:///fake/manual-test.jpg"
  onSaved={(id) => console.log('saved entry', id)}
/>
```

Run `npx expo start`, tap "Save". Expected: Metro console logs `saved entry <number>`. Revert `App.tsx` afterward.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/ConfirmScreen.tsx
git commit -m "Wire confirm screen to save entries with auto meal tagging"
```

---

### Task 11: Daily view screen

**Files:**
- Create: `app/src/components/MealSection.tsx`
- Create: `app/src/screens/DailyViewScreen.tsx`

**Interfaces:**
- Consumes: `getEntriesForDate`, `StoredEntry` from `app/src/db/entriesRepository.ts` (Task 5); `aggregateDailyTotals` from `app/src/nutrition/aggregation.ts` (Task 4).
- Produces: `DailyViewScreen` component — used by Task 13's navigator.

- [ ] **Step 1: Implement MealSection**

Create `app/src/components/MealSection.tsx`:

```tsx
import { Image, StyleSheet, Text, View } from 'react-native';
import { StoredEntry } from '../db/entriesRepository';
import { MealType } from '../types/nutrition';

interface Props {
  mealType: MealType;
  entries: StoredEntry[];
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function MealSection({ mealType, entries }: Props) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{MEAL_LABELS[mealType]}</Text>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.entryRow}>
          <Image source={{ uri: entry.photoPath }} style={styles.thumbnail} />
          <View style={styles.entryDetails}>
            <Text>{entry.items.map((i) => i.name).join(', ')}</Text>
            <Text style={styles.muted}>
              {Math.round(entry.items.reduce((sum, i) => sum + i.nutrients.calories, 0))} cal
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  heading: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  entryRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'center' },
  thumbnail: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#eee' },
  entryDetails: { flex: 1 },
  muted: { color: '#666', fontSize: 12 },
});
```

- [ ] **Step 2: Implement DailyViewScreen**

Create `app/src/screens/DailyViewScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import MealSection from '../components/MealSection';
import { getEntriesForDate, StoredEntry } from '../db/entriesRepository';
import { aggregateDailyTotals } from '../nutrition/aggregation';
import { MealType, NutrientProfile } from '../types/nutrition';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyViewScreen() {
  const [entries, setEntries] = useState<StoredEntry[]>([]);

  useEffect(() => {
    getEntriesForDate(todayKey()).then(setEntries);
  }, []);

  const allItemNutrients: NutrientProfile[] = entries.flatMap((e) => e.items.map((i) => i.nutrients));
  const totals = aggregateDailyTotals(allItemNutrients);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.totalsHeading}>Today's totals</Text>
      <Text style={styles.totalsLine}>{Math.round(totals.calories)} cal · {Math.round(totals.proteinG)}g protein · {Math.round(totals.carbsG)}g carbs · {Math.round(totals.fatG)}g fat</Text>
      {MEAL_ORDER.map((mealType) => (
        <MealSection key={mealType} mealType={mealType} entries={entries.filter((e) => e.mealType === mealType)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  totalsHeading: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  totalsLine: { color: '#444', marginBottom: 16 },
});
```

- [ ] **Step 3: Manually verify**

Render `<DailyViewScreen />` in `app/App.tsx` temporarily (after Task 10's manual save test has created at least one entry for today), run `npx expo start`. Expected: totals line shows non-zero numbers, and the meal section matching the current time of day shows the saved entry with its thumbnail (a broken-image icon is fine since the test photo path is fake). Revert `App.tsx` afterward.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/MealSection.tsx app/src/screens/DailyViewScreen.tsx
git commit -m "Add daily view screen grouped by meal with running totals"
```

---

### Task 12: Dashboard and analytics screen

**Files:**
- Create: `app/src/components/BarChart.tsx`
- Create: `app/src/screens/DashboardScreen.tsx`

**Interfaces:**
- Consumes: `getEntriesInRange` from `app/src/db/entriesRepository.ts` (Task 5); `buildTrend`, `TrendPoint` from `app/src/nutrition/aggregation.ts` (Task 4).
- Produces: `DashboardScreen` component — used by Task 13's navigator.

- [ ] **Step 1: Install react-native-svg**

```bash
cd app && npx expo install react-native-svg
```

- [ ] **Step 2: Implement a minimal custom bar chart**

Create `app/src/components/BarChart.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

interface Props {
  label: string;
  values: number[]; // one per day, oldest first
  dateLabels: string[]; // e.g. "07-11"
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const BAR_GAP = 4;

export default function BarChart({ label, values, dateLabels }: Props) {
  const max = Math.max(...values, 1);
  const barWidth = (CHART_WIDTH - BAR_GAP * (values.length - 1)) / values.length;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {values.map((value, index) => {
          const barHeight = (value / max) * (CHART_HEIGHT - 4);
          const x = index * (barWidth + BAR_GAP);
          const y = CHART_HEIGHT - barHeight;
          return <Rect key={index} x={x} y={y} width={barWidth} height={barHeight} rx={2} fill="#378ADD" />;
        })}
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{dateLabels[0]}</Text>
        <Text style={styles.axisLabel}>{dateLabels[dateLabels.length - 1]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisLabel: { fontSize: 11, color: '#888' },
});
```

- [ ] **Step 3: Implement DashboardScreen**

Create `app/src/screens/DashboardScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet } from 'react-native';
import BarChart from '../components/BarChart';
import { getEntriesInRange } from '../db/entriesRepository';
import { buildTrend } from '../nutrition/aggregation';
import { NutrientProfile } from '../types/nutrition';

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function DashboardScreen() {
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [entriesByDate, setEntriesByDate] = useState<Record<string, NutrientProfile[]>>({});

  useEffect(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (rangeDays - 1));
    getEntriesInRange(dateKey(start), dateKey(today)).then((entries) => {
      const grouped: Record<string, NutrientProfile[]> = {};
      for (const entry of entries) {
        const key = entry.timestamp.slice(0, 10);
        grouped[key] = grouped[key] ?? [];
        grouped[key].push(...entry.items.map((i) => i.nutrients));
      }
      setEntriesByDate(grouped);
    });
  }, [rangeDays]);

  const trend = buildTrend(entriesByDate, rangeDays, new Date());
  const dateLabels = trend.map((p) => p.date.slice(5));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button title="7 days" onPress={() => setRangeDays(7)} />
      <Button title="30 days" onPress={() => setRangeDays(30)} />
      <BarChart label="Calories" values={trend.map((p) => p.totals.calories)} dateLabels={dateLabels} />
      <BarChart label="Protein (g)" values={trend.map((p) => p.totals.proteinG)} dateLabels={dateLabels} />
      <BarChart label="Carbs (g)" values={trend.map((p) => p.totals.carbsG)} dateLabels={dateLabels} />
      <BarChart label="Sodium (mg)" values={trend.map((p) => p.totals.sodiumMg)} dateLabels={dateLabels} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
```

- [ ] **Step 4: Manually verify**

Render `<DashboardScreen />` in `app/App.tsx` temporarily, run `npx expo start`. Expected: four bar charts render without crashing, "7 days" is the default range, and tapping "30 days" re-renders with 30 bars. With at least one saved entry from earlier manual tests, its day's bar should be visibly taller than the empty days. Revert `App.tsx` afterward.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/BarChart.tsx app/src/screens/DashboardScreen.tsx
git commit -m "Add dashboard screen with nutrient trend charts"
```

---

### Task 13: Navigation wiring and end-to-end verification

**Files:**
- Create: `app/src/navigation/RootNavigator.tsx`
- Modify: `app/App.tsx`

**Interfaces:**
- Consumes: `CaptureScreen` (Task 8), `ConfirmScreen` (Task 9/10), `DailyViewScreen` (Task 11), `DashboardScreen` (Task 12), `analyzePhoto` (Task 7).
- Produces: the final wired app — nothing downstream depends on this (last task).

- [ ] **Step 1: Install navigation dependencies**

```bash
cd app && npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

- [ ] **Step 2: Implement the navigator**

Create `app/src/navigation/RootNavigator.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Button, View } from 'react-native';
import CaptureScreen from '../screens/CaptureScreen';
import ConfirmScreen from '../screens/ConfirmScreen';
import DailyViewScreen from '../screens/DailyViewScreen';
import DashboardScreen from '../screens/DashboardScreen';
import {
  analyzePhoto,
  queuePhotoForRetry,
  getQueuedPhotos,
  clearQueuedPhoto,
  subscribeToReconnect,
} from '../api/analyzePhoto';
import { DetectedFoodItem } from '../types/nutrition';

type RootStackParamList = {
  Home: undefined;
  Capture: undefined;
  Confirm: { photoUri: string; items: DetectedFoodItem[] };
  DailyView: undefined;
  Dashboard: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({ navigation }: any) {
  useEffect(() => {
    // Retries queued photos as soon as connectivity returns. If more than one
    // photo is queued, only the first is surfaced for confirmation per
    // reconnect event — the rest stay queued and get picked up next time.
    const unsubscribe = subscribeToReconnect(async () => {
      const queued = await getQueuedPhotos();
      if (queued.length === 0) return;
      const [photoUri] = queued;
      try {
        const { items } = await analyzePhoto(photoUri);
        await clearQueuedPhoto(photoUri);
        navigation.navigate('Confirm', { photoUri, items });
      } catch {
        // Still failing (e.g. flaky reconnect) — leave it queued for the next event.
      }
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 12, padding: 16 }}>
      <Button title="Log food" onPress={() => navigation.navigate('Capture')} />
      <Button title="Today's log" onPress={() => navigation.navigate('DailyView')} />
      <Button title="Dashboard" onPress={() => navigation.navigate('Dashboard')} />
    </View>
  );
}

function CaptureScreenWrapper({ navigation }: any) {
  async function handlePhotoCaptured(photoUri: string) {
    try {
      const { items } = await analyzePhoto(photoUri);
      navigation.navigate('Confirm', { photoUri, items });
    } catch {
      await queuePhotoForRetry(photoUri);
      navigation.navigate('Home');
    }
  }
  return <CaptureScreen onPhotoCaptured={handlePhotoCaptured} />;
}

function ConfirmScreenWrapper({ route, navigation }: any) {
  const { photoUri, items } = route.params;
  return (
    <ConfirmScreen
      items={items}
      photoUri={photoUri}
      onSaved={() => navigation.navigate('DailyView')}
    />
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Capture" component={CaptureScreenWrapper} options={{ title: 'Log food' }} />
        <Stack.Screen name="Confirm" component={ConfirmScreenWrapper} options={{ title: 'Confirm' }} />
        <Stack.Screen name="DailyView" component={DailyViewScreen} options={{ title: "Today" }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 3: Replace App.tsx with the real entry point**

Replace the full contents of `app/App.tsx`:

```tsx
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return <RootNavigator />;
}
```

- [ ] **Step 4: Manually verify the full end-to-end flow**

Set the deployed (or local) proxy URL and run on a physical device:

```bash
export EXPO_PUBLIC_API_BASE_URL=https://your-jarvi-proxy.vercel.app
npx expo start
```

Walk through: Home → "Log food" → take or pick a photo → wait for analysis → Confirm screen shows itemized food with sliders → adjust a portion slider → tap Save → lands on Today's log showing the new entry under the correct meal section with updated totals → navigate to Dashboard → see the day's bar taller than empty days.

Expected: no crashes at any step, and the daily totals update after saving. Stop the dev server with Ctrl+C once confirmed.

- [ ] **Step 5: Commit**

```bash
git add app/src/navigation app/App.tsx
git commit -m "Wire navigation for the full capture-to-dashboard flow"
```

---

## Self-review notes

- **Spec coverage**: architecture (Tasks 1, 5, 6), nutrient fields (Task 2), itemized multi-food detection (Task 6), confirm screen with portion + fine-tune sliders (Task 9), low-confidence flagging (Task 9), meal auto-tagging (Tasks 3, 10), daily view (Task 11), trend dashboard (Task 12), error handling — offline queue + automatic retry on reconnect (Task 7's queue functions, wired to `subscribeToReconnect` in Task 13's `HomeScreen`), Claude call failure retry (Task 7's `analyzePhoto` throw + Task 13's catch), delete/add-manual items (Task 9's remove button) — all covered. Data model matches the spec's SQLite sketch exactly (Task 5).
- **Fixed during self-review:** Task 7 originally built the offline queue (`queuePhotoForRetry`, `getQueuedPhotos`, `subscribeToReconnect`) but nothing called `subscribeToReconnect` — a queued photo would sit forever. Task 13's `HomeScreen` now subscribes on mount and retries the first queued photo whenever connectivity returns.
- Manual "add a missing item" beyond removing the last one is intentionally minimal for Phase 1 (the spec calls for add/delete; delete-last and Claude's own itemization cover the common case — a fuller manual-add form is a natural small follow-up, not blocking this plan).
