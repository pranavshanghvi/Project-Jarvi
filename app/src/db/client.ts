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
