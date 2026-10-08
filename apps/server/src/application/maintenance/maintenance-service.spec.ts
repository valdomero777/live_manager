import { describe, expect, it } from 'vitest';
import {
  backupName,
  parseBackupName,
  type BackupEntry,
} from '../../domain/maintenance/backup-names.js';
import { FakeClock } from '../../domain/shared/time.js';
import type { BackupStore } from '../ports/backup-store.js';
import { silentLogger } from '../ports/logger.js';
import type { Cancel, Scheduler } from '../ports/scheduler.js';
import { DEFAULT_MAINTENANCE, MaintenanceService } from './maintenance-service.js';

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 8, 4, 0, 0);

function setup(existing: BackupEntry[] = []) {
  const clock = new FakeClock(START);
  const entries = [...existing];
  const created: string[] = [];
  const purges: number[] = [];
  let failBackups = false;
  const store: BackupStore = {
    list: async () => [...entries],
    createDatabaseBackup: async (name) => {
      if (failBackups) throw new Error('disk full');
      created.push(name);
      entries.push(parseBackupName(name)!);
      return 1;
    },
    createAssetsBackup: async (name) => {
      created.push(name);
      entries.push(parseBackupName(name)!);
      return 1;
    },
    remove: async (entry) => {
      entries.splice(entries.indexOf(entry), 1);
    },
  };
  const timers: (() => void)[] = [];
  const scheduler: Scheduler = {
    setTimeout: (fn): Cancel => (timers.push(fn), () => undefined),
    setInterval: (fn): Cancel => (timers.push(fn), () => undefined),
  };
  const service = new MaintenanceService({
    store,
    retention: { purgeEventsBefore: async (ts) => (purges.push(ts), 7) },
    scheduler,
    clock,
    logger: silentLogger,
  });
  return { service, clock, created, purges, entries, timers, fail: () => (failBackups = true) };
}

const db = (ts: number) => parseBackupName(backupName('db', ts))!;
const assets = (ts: number) => parseBackupName(backupName('assets', ts))!;

describe('MaintenanceService', () => {
  it('given no backups, when it runs, then backs up the database and assets and purges old events', async () => {
    const t = setup();
    await t.service.tick();
    expect(t.created).toEqual([backupName('db', START), backupName('assets', START)]);
    expect(t.purges).toEqual([START - DEFAULT_MAINTENANCE.eventRetentionMs]);
    expect((await t.service.status()).lastPurge).toEqual({ at: START, deleted: 7 });
  });

  it('given a backup made hours ago, when it runs, then does not repeat it (restart-safe)', async () => {
    const t = setup([db(START - 5 * 3_600_000), assets(START - DAY)]);
    await t.service.tick();
    expect(t.created).toEqual([]);
  });

  it('given a day has passed, when it runs, then a new database backup is made and old ones are pruned', async () => {
    const t = setup([db(START - 20 * DAY), db(START - 2 * DAY), assets(START - DAY)]);
    await t.service.tick();
    expect(t.created).toEqual([backupName('db', START)]);
    expect(t.entries.map((e) => e.createdAt)).not.toContain(START - 20 * DAY);
    expect(t.entries.map((e) => e.createdAt)).toContain(START - 2 * DAY);
  });

  it('purges events once a day, not on every hourly pass', async () => {
    const t = setup([db(START), assets(START)]);
    await t.service.tick();
    t.clock.advance(3_600_000);
    await t.service.tick();
    expect(t.purges).toHaveLength(1);
    t.clock.advance(DAY);
    await t.service.tick();
    expect(t.purges).toHaveLength(2);
  });

  it('given the disk is full, then tick does not throw and reports the error', async () => {
    const t = setup();
    t.fail();
    await expect(t.service.tick()).resolves.toBeUndefined();
    expect((await t.service.status()).lastError).toBe('disk full');
  });

  it('schedules a first check and an hourly one', () => {
    const t = setup();
    t.service.start();
    expect(t.timers).toHaveLength(2);
  });

  it('backupNow ignores the schedule', async () => {
    const t = setup([db(START)]);
    const entry = await t.service.backupNow('db');
    expect(entry.name).toBe(backupName('db', START));
    expect(t.created).toHaveLength(1);
  });
});
