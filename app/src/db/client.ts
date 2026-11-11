import * as SQLite from 'expo-sqlite';
import { ENTRIES_TABLE_SQL, ITEMS_TABLE_SQL } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  const db = await SQLite.openDatabaseAsync('jarvi.db');
  await db.execAsync(ENTRIES_TABLE_SQL);
  await db.execAsync(ITEMS_TABLE_SQL);
  // A phone that installed the app before added sugar existed has the older table. Add the
  // column in place (existing meals get 0) so nothing already logged is lost.
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(items);');
  if (!columns.some((column) => column.name === 'added_sugar_g')) {
    await db.execAsync('ALTER TABLE items ADD COLUMN added_sugar_g REAL NOT NULL DEFAULT 0;');
  }
  dbInstance = db;
  return db;
}
