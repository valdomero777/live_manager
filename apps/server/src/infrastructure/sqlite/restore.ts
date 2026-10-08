import { copyFileSync, existsSync, rmSync } from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';

export class RestoreError extends Error {}

/**
 * Replaces the database with a backup. The server must be stopped. The backup is checked first
 * (integrity and expected tables) and the current database is kept next to it as
 * "<db>.before-restore" so the operation can be undone. Returns that safety copy's path.
 */
export function restoreDatabase(backupPath: string, dbPath: string): string | undefined {
  if (!existsSync(backupPath)) throw new RestoreError(`No existe el respaldo ${backupPath}`);
  verifyBackup(backupPath);
  let safety: string | undefined;
  if (existsSync(dbPath)) {
    safety = `${dbPath}.before-restore`;
    copyFileSync(dbPath, safety);
  }
  for (const suffix of ['-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
  copyFileSync(backupPath, dbPath);
  return safety;
}

function verifyBackup(path: string): void {
  const db = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
  try {
    const check = db.pragma('integrity_check', { simple: true });
    if (check !== 'ok') throw new RestoreError(`El respaldo está dañado: ${String(check)}`);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const names = new Set(tables.map((t) => t.name));
    for (const required of ['live_event', 'rule', 'schema_migration']) {
      if (!names.has(required)) throw new RestoreError(`El archivo no es un respaldo de TikLive`);
    }
  } finally {
    db.close();
  }
}
