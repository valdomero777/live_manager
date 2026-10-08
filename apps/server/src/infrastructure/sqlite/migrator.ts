import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type BetterSqlite3 from 'better-sqlite3';

const MIGRATION_FILE = /^\d{4}_[\w-]+\.sql$/;

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../migrations', import.meta.url),
);

export class MigrationError extends Error {
  constructor(name: string, cause: unknown) {
    super(`Migration ${name} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'MigrationError';
  }
}

/**
 * Applies numbered SQL files in order, each inside its own transaction. Startup fails loudly
 * if one cannot be applied. Already applied files are skipped (idempotent).
 */
export function runMigrations(
  sqlite: BetterSqlite3.Database,
  dir = DEFAULT_MIGRATIONS_DIR,
  now = Date.now(),
): string[] {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const applied = new Set(
    sqlite
      .prepare('SELECT name FROM schema_migration')
      .all()
      .map((r) => (r as { name: string }).name),
  );
  const pending = readdirSync(dir)
    .filter((f) => MIGRATION_FILE.test(f) && !applied.has(f))
    .sort();

  const record = sqlite.prepare('INSERT INTO schema_migration (name, applied_at) VALUES (?, ?)');
  for (const name of pending) {
    const sql = readFileSync(join(dir, name), 'utf8');
    try {
      sqlite.transaction(() => {
        sqlite.exec(sql);
        record.run(name, now);
      })();
    } catch (error) {
      throw new MigrationError(name, error);
    }
  }
  return pending;
}
