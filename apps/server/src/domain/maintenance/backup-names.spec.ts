import { describe, expect, it } from 'vitest';
import { backupName, expiredBackups, isDue, parseBackupName } from './backup-names.js';

const T = Date.UTC(2026, 9, 8, 4, 5, 6);
const DAY = 86_400_000;

describe('backup names', () => {
  it('round-trips a timestamp (to the second)', () => {
    expect(backupName('db', T)).toBe('app-20261008T040506Z.db');
    expect(backupName('assets', T)).toBe('assets-20261008T040506Z');
    expect(parseBackupName(backupName('db', T))).toEqual({
      name: 'app-20261008T040506Z.db',
      kind: 'db',
      createdAt: T,
    });
    expect(parseBackupName(backupName('assets', T))?.kind).toBe('assets');
  });

  it('ignores partial and foreign files', () => {
    for (const name of [
      'app-20261008T040506Z.db.partial',
      'notes.txt',
      'app-latest.db',
      '.DS_Store',
    ])
      expect(parseBackupName(name)).toBeUndefined();
  });
});

describe('expiredBackups', () => {
  const entry = (days: number) => parseBackupName(backupName('db', T - days * DAY))!;

  it('returns backups older than the limit, never the newest one', () => {
    const entries = [entry(0), entry(3), entry(15), entry(20)];
    expect(expiredBackups(entries, 'db', T, 14 * DAY).map((e) => e.createdAt)).toEqual([
      T - 15 * DAY,
      T - 20 * DAY,
    ]);
    // all stale: the newest survives so there is always something to restore
    expect(expiredBackups([entry(30), entry(40)], 'db', T, DAY)).toEqual([entry(40)]);
  });
});

describe('isDue', () => {
  it('is due when never done or when the interval passed', () => {
    expect(isDue(undefined, T, DAY)).toBe(true);
    expect(isDue(T - DAY + 1, T, DAY)).toBe(false);
    expect(isDue(T - DAY, T, DAY)).toBe(true);
  });
});
