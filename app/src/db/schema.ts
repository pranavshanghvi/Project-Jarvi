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
