import fs from 'node:fs';
import path from 'node:path';
import {
  createInitialDatabaseCore,
  normalizeDatabaseCore,
} from '../shared/ledgerCore';
import { AppDatabase } from '../shared/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'kakeibo-store.json');
const DB_TMP_PATH = path.join(DATA_DIR, 'kakeibo-store.tmp.json');
const DB_BAK_PATH = path.join(DATA_DIR, 'kakeibo-store.bak.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDatabase(): AppDatabase {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDatabaseCore();
    saveDatabase(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppDatabase>;
    return normalizeDatabaseCore(parsed);
  } catch {
    if (fs.existsSync(DB_BAK_PATH)) {
      const bakRaw = fs.readFileSync(DB_BAK_PATH, 'utf-8');
      const parsedBak = JSON.parse(bakRaw) as Partial<AppDatabase>;
      return normalizeDatabaseCore(parsedBak);
    }
    const fresh = createInitialDatabaseCore();
    saveDatabase(fresh);
    return fresh;
  }
}

export function saveDatabase(db: AppDatabase): AppDatabase {
  ensureDataDir();
  db.lastUpdatedAt = new Date().toISOString();
  const normalized = normalizeDatabaseCore(db);
  const serialized = JSON.stringify(normalized, null, 2);

  if (fs.existsSync(DB_PATH)) {
    try {
      fs.copyFileSync(DB_PATH, DB_BAK_PATH);
    } catch {
      // Ignore backup copy errors
    }
  }

  fs.writeFileSync(DB_TMP_PATH, serialized, 'utf-8');
  fs.renameSync(DB_TMP_PATH, DB_PATH);
  return normalized;
}
