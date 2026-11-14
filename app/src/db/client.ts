import * as SQLite from 'expo-sqlite';
import { ENTRIES_TABLE_SQL, ITEMS_TABLE_SQL } from './schema';

// The one opening of the database, shared by everyone who asks. Several screens ask at the same
// moment when the app starts; before this was shared, each ran the "add the missing column" step
// below, and the second one failed with "duplicate column name: source" (seen 2026-11-13 on a
// fresh install). Now the first caller does the work and the rest wait for the same result.
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = openAndUpgrade().catch((error) => {
      opening = null; // let the next caller try again rather than hand out a failure for good
      throw error;
    });
  }
  return opening;
}

async function openAndUpgrade(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('jarvi.db');
  await db.execAsync(ENTRIES_TABLE_SQL);
  await db.execAsync(ITEMS_TABLE_SQL);
  // A phone that installed the app before added sugar existed has the older table. Add the
  // column in place (existing meals get 0) so nothing already logged is lost.
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(items);');
  if (!columns.some((column) => column.name === 'added_sugar_g')) {
    await db.execAsync('ALTER TABLE items ADD COLUMN added_sugar_g REAL NOT NULL DEFAULT 0;');
  }
  // Same again for where a food's numbers came from. Meals logged before this have '' (unknown).
  if (!columns.some((column) => column.name === 'source')) {
    await db.execAsync("ALTER TABLE items ADD COLUMN source TEXT NOT NULL DEFAULT '';");
  }
  return db;
}
