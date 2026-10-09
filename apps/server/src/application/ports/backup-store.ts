import type { BackupEntry } from '../../domain/maintenance/backup-names.js';

/** Where backups live. Implementations never expose a half-written backup in list(). */
export interface BackupStore {
  list(): Promise<BackupEntry[]>;
  /** Consistent online copy of the database (safe while the app writes). Returns bytes. */
  createDatabaseBackup(name: string): Promise<number>;
  createAssetsBackup(name: string): Promise<number>;
  remove(entry: BackupEntry): Promise<void>;
}

/** Old-data cleanup (spec 6: live_event is kept 90 days; totals live in leaderboard_total). */
export interface EventRetention {
  /** Deletes events that happened before the timestamp; returns how many. */
  purgeEventsBefore(timestamp: number): Promise<number>;
}
