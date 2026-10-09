import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { BackupStore } from '../../application/ports/backup-store.js';
import { parseBackupName, type BackupEntry } from '../../domain/maintenance/backup-names.js';

const PARTIAL = '.partial';

/** Backups as files in one folder. Work happens in "<name>.partial" and is renamed when whole. */
export class FileBackupStore implements BackupStore {
  constructor(
    private readonly sqlite: BetterSqlite3.Database,
    private readonly dir: string,
    private readonly assetsDir: string,
  ) {}

  async list(): Promise<BackupEntry[]> {
    await mkdir(this.dir, { recursive: true });
    const names = await readdir(this.dir);
    return names.flatMap((name) => parseBackupName(name) ?? []);
  }

  async createDatabaseBackup(name: string): Promise<number> {
    await mkdir(this.dir, { recursive: true });
    const target = join(this.dir, name);
    // better-sqlite3 copies page by page and yields to the event loop, so writes keep flowing.
    await this.sqlite.backup(target + PARTIAL);
    await rename(target + PARTIAL, target);
    return (await stat(target)).size;
  }

  async createAssetsBackup(name: string): Promise<number> {
    await mkdir(this.dir, { recursive: true });
    const target = join(this.dir, name);
    await rm(target + PARTIAL, { recursive: true, force: true });
    await cp(this.assetsDir, target + PARTIAL, { recursive: true });
    await rename(target + PARTIAL, target);
    return directorySize(target);
  }

  async remove(entry: BackupEntry): Promise<void> {
    await rm(join(this.dir, entry.name), { recursive: true, force: true });
  }
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    total += item.isDirectory() ? await directorySize(path) : (await stat(path)).size;
  }
  return total;
}
