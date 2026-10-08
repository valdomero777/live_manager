import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.js';

export interface DatabaseHandle {
  readonly sqlite: BetterSqlite3.Database;
  readonly db: Kysely<Database>;
  close(): Promise<void>;
}

const PRAGMAS = [
  'journal_mode = WAL',
  'synchronous = NORMAL',
  'foreign_keys = ON',
  'busy_timeout = 5000',
];

/** Opens SQLite with the pragmas from the spec. Use ':memory:' for tests. */
export function openDatabase(path: string): DatabaseHandle {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new BetterSqlite3(path);
  for (const pragma of PRAGMAS) sqlite.pragma(pragma);
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  return { sqlite, db, close: () => db.destroy() };
}

export function isDatabaseHealthy(handle: DatabaseHandle): boolean {
  try {
    handle.sqlite.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}
