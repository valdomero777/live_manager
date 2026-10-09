import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupName } from '../src/domain/maintenance/backup-names.js';
import { FileBackupStore } from '../src/infrastructure/backup/file-backup-store.js';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { runMigrations } from '../src/infrastructure/sqlite/migrator.js';
import { RestoreError, restoreDatabase } from '../src/infrastructure/sqlite/restore.js';
import { SqliteEventRetention } from '../src/infrastructure/sqlite/sqlite-event-retention.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tiklive-maint-'));
  dirs.push(dir);
  return dir;
};

function seededDatabase(dir: string) {
  const handle = openDatabase(join(dir, 'app.db'));
  runMigrations(handle.sqlite);
  handle.sqlite.exec(`
    INSERT INTO live_session (id, tiktok_user, started_at) VALUES (1, 'alan', 0);
    INSERT INTO rule (name, trigger, conditions, actions) VALUES ('r', 'gift', '[]', '[]');`);
  return handle;
}

describe('backup and restore', () => {
  it('a backup taken while running restores to the same rows', async () => {
    const dir = tempDir();
    const assetsDir = join(dir, 'assets');
    mkdirSync(assetsDir);
    writeFileSync(join(assetsDir, 'a.wav'), 'sound');
    const handle = seededDatabase(dir);
    const store = new FileBackupStore(handle.sqlite, join(dir, 'backups'), assetsDir);

    const name = backupName('db', Date.UTC(2026, 9, 8));
    expect(await store.createDatabaseBackup(name)).toBeGreaterThan(0);
    await store.createAssetsBackup(backupName('assets', Date.UTC(2026, 9, 8)));
    expect((await store.list()).map((e) => e.kind).sort()).toEqual(['assets', 'db']);

    handle.sqlite.exec('DELETE FROM rule');
    await handle.close();
    handle.sqlite.close();

    const safety = restoreDatabase(join(dir, 'backups', name), join(dir, 'app.db'));
    expect(safety && existsSync(safety)).toBe(true);
    const restored = openDatabase(join(dir, 'app.db'));
    expect(restored.sqlite.prepare('SELECT COUNT(*) AS n FROM rule').get()).toEqual({ n: 1 });
    await restored.close();
    expect(
      readFileSync(
        join(dir, 'backups', backupName('assets', Date.UTC(2026, 9, 8)), 'a.wav'),
        'utf8',
      ),
    ).toBe('sound');
  });

  it('never lists a half-written backup', async () => {
    const dir = tempDir();
    const handle = seededDatabase(dir);
    const backups = join(dir, 'backups');
    mkdirSync(backups);
    writeFileSync(join(backups, 'app-20261008T040000Z.db.partial'), 'x');
    const store = new FileBackupStore(handle.sqlite, backups, dir);
    expect(await store.list()).toEqual([]);
    await handle.close();
  });

  it('refuses a file that is not a TikLive backup and keeps the current database', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'fake.db'), 'not a database');
    writeFileSync(join(dir, 'app.db'), 'current');
    expect(() => restoreDatabase(join(dir, 'fake.db'), join(dir, 'app.db'))).toThrow();
    expect(() => restoreDatabase(join(dir, 'missing.db'), join(dir, 'app.db'))).toThrow(
      RestoreError,
    );
    expect(readFileSync(join(dir, 'app.db'), 'utf8')).toBe('current');
  });
});

describe('event retention', () => {
  it('deletes only events older than the cut-off, in chunks, and keeps viewers', async () => {
    const dir = tempDir();
    const handle = seededDatabase(dir);
    const insert = handle.sqlite.prepare(
      "INSERT INTO live_event (event_uid, session_id, type, payload, occurred_at) VALUES (?, 1, 'comment', '{}', ?)",
    );
    handle.sqlite.transaction(() => {
      for (let i = 0; i < 12_000; i++) insert.run(`old-${i}`, 1_000 + i);
      for (let i = 0; i < 5; i++) insert.run(`new-${i}`, 10_000_000 + i);
    })();

    const deleted = await new SqliteEventRetention(handle.sqlite).purgeEventsBefore(5_000_000);

    expect(deleted).toBe(12_000);
    expect(handle.sqlite.prepare('SELECT COUNT(*) AS n FROM live_event').get()).toEqual({ n: 5 });
    await handle.close();
  });
});
