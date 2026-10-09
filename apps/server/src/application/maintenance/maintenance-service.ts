import {
  expiredBackups,
  backupName,
  isDue,
  type BackupEntry,
  type BackupKind,
} from '../../domain/maintenance/backup-names.js';
import type { Clock } from '../../domain/shared/time.js';
import type { BackupStore, EventRetention } from '../ports/backup-store.js';
import type { Logger } from '../ports/logger.js';
import type { Cancel, Scheduler } from '../ports/scheduler.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface MaintenanceOptions {
  readonly dbEveryMs: number;
  readonly assetsEveryMs: number;
  readonly keepDbMs: number;
  readonly keepAssetsMs: number;
  readonly eventRetentionMs: number;
  /** First check after boot; later ones every hour. */
  readonly firstCheckMs: number;
}

/** Spec 4: daily database backup (14 days kept), weekly assets copy, 90-day event retention. */
export const DEFAULT_MAINTENANCE: MaintenanceOptions = {
  dbEveryMs: DAY_MS,
  assetsEveryMs: 7 * DAY_MS,
  keepDbMs: 14 * DAY_MS,
  keepAssetsMs: 28 * DAY_MS,
  eventRetentionMs: 90 * DAY_MS,
  firstCheckMs: 60_000,
};

export interface MaintenanceStatus {
  readonly lastDbBackupAt: number | null;
  readonly lastAssetsBackupAt: number | null;
  readonly lastPurge: { at: number; deleted: number } | null;
  readonly lastError: string | null;
  readonly backups: readonly BackupEntry[];
}

interface Deps {
  readonly store: BackupStore;
  readonly retention: EventRetention;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly options?: MaintenanceOptions;
}

/**
 * Runs without cron so it works the same on Linux and Windows. Everything is derived from the
 * backup names, so a restart neither repeats a backup that was just made nor forgets one.
 */
export class MaintenanceService {
  private readonly options: MaintenanceOptions;
  private cancels: Cancel[] = [];
  private running: Promise<void> | undefined;
  private lastPurge: MaintenanceStatus['lastPurge'] = null;
  private lastError: string | null = null;
  private lastDb: number | null = null;

  constructor(private readonly deps: Deps) {
    this.options = deps.options ?? DEFAULT_MAINTENANCE;
  }

  start(): void {
    const { scheduler } = this.deps;
    this.cancels = [
      scheduler.setTimeout(() => void this.tick(), this.options.firstCheckMs),
      scheduler.setInterval(() => void this.tick(), HOUR_MS),
    ];
  }

  dispose(): void {
    this.cancels.forEach((cancel) => cancel());
    this.cancels = [];
  }

  /** One pass: back up what is due, prune old backups, purge old events. Never throws. */
  tick(): Promise<void> {
    this.running ??= this.pass().finally(() => (this.running = undefined));
    return this.running;
  }

  /** Backs up now (dashboard button), regardless of the schedule. */
  async backupNow(kind: BackupKind = 'db'): Promise<BackupEntry> {
    const at = this.deps.clock.now();
    const name = backupName(kind, at);
    if (kind === 'db') await this.deps.store.createDatabaseBackup(name);
    else await this.deps.store.createAssetsBackup(name);
    this.deps.logger.info({ name }, 'backup created');
    const createdAt = Math.floor(at / 1000) * 1000;
    if (kind === 'db') this.lastDb = createdAt;
    return { name, kind, createdAt };
  }

  /** Newest database backup seen so far (memory only; null until the first check ran). */
  lastDbBackupAt(): number | null {
    return this.lastDb;
  }

  async status(): Promise<MaintenanceStatus> {
    const backups = (await this.deps.store.list()).sort((a, b) => b.createdAt - a.createdAt);
    const last = (kind: BackupKind) => backups.find((b) => b.kind === kind)?.createdAt ?? null;
    return {
      lastDbBackupAt: last('db'),
      lastAssetsBackupAt: last('assets'),
      lastPurge: this.lastPurge,
      lastError: this.lastError,
      backups,
    };
  }

  private async pass(): Promise<void> {
    try {
      await this.backupIfDue();
      await this.prune();
      await this.purgeEvents();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.deps.logger.error({ err: this.lastError }, 'maintenance failed');
    }
  }

  private async backupIfDue(): Promise<void> {
    const now = this.deps.clock.now();
    const entries = await this.deps.store.list();
    const latest = (kind: BackupKind) =>
      Math.max(0, ...entries.filter((e) => e.kind === kind).map((e) => e.createdAt)) || undefined;
    this.lastDb = latest('db') ?? this.lastDb;
    if (isDue(latest('db'), now, this.options.dbEveryMs)) await this.backupNow('db');
    if (isDue(latest('assets'), now, this.options.assetsEveryMs)) await this.backupNow('assets');
  }

  private async prune(): Promise<void> {
    const now = this.deps.clock.now();
    const entries = await this.deps.store.list();
    const old = [
      ...expiredBackups(entries, 'db', now, this.options.keepDbMs),
      ...expiredBackups(entries, 'assets', now, this.options.keepAssetsMs),
    ];
    for (const entry of old) await this.deps.store.remove(entry);
    if (old.length > 0) this.deps.logger.info({ removed: old.length }, 'old backups removed');
  }

  private async purgeEvents(): Promise<void> {
    const now = this.deps.clock.now();
    if (this.lastPurge && now - this.lastPurge.at < DAY_MS) return;
    const deleted = await this.deps.retention.purgeEventsBefore(
      now - this.options.eventRetentionMs,
    );
    this.lastPurge = { at: now, deleted };
    if (deleted > 0) this.deps.logger.info({ deleted }, 'old events purged');
  }
}
