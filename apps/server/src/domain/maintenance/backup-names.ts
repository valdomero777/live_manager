export type BackupKind = 'db' | 'assets';

export interface BackupEntry {
  readonly name: string;
  readonly kind: BackupKind;
  readonly createdAt: number;
}

const PREFIX: Record<BackupKind, string> = { db: 'app-', assets: 'assets-' };
const SUFFIX: Record<BackupKind, string> = { db: '.db', assets: '' };
const STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** "app-20261008T040000Z.db" / "assets-20261008T040000Z": sortable and timezone-free. */
export function backupName(kind: BackupKind, at: number): string {
  const d = new Date(at);
  const stamp =
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return `${PREFIX[kind]}${stamp}${SUFFIX[kind]}`;
}

/** Returns undefined for anything that is not a finished backup (e.g. a .partial file). */
export function parseBackupName(name: string): BackupEntry | undefined {
  for (const kind of ['db', 'assets'] as const) {
    if (!name.startsWith(PREFIX[kind]) || !name.endsWith(SUFFIX[kind])) continue;
    const stamp = name.slice(PREFIX[kind].length, name.length - SUFFIX[kind].length);
    const m = STAMP.exec(stamp);
    if (!m) continue;
    const [, y, mo, d, h, mi, s] = m.map(Number);
    return { name, kind, createdAt: Date.UTC(y ?? 0, (mo ?? 1) - 1, d, h, mi, s) };
  }
  return undefined;
}

/** Backups of a kind that are older than keepMs, but never the newest one. */
export function expiredBackups(
  entries: readonly BackupEntry[],
  kind: BackupKind,
  now: number,
  keepMs: number,
): BackupEntry[] {
  const ofKind = entries.filter((e) => e.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
  return ofKind.slice(1).filter((e) => now - e.createdAt > keepMs);
}

export function isDue(lastAt: number | undefined, now: number, everyMs: number): boolean {
  return lastAt === undefined || now - lastAt >= everyMs;
}
