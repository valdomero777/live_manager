import { describe, expect, it } from 'vitest';
import { healthAlerts, type AlertInputs } from './health-alerts.js';

const NOW = 10_000_000;
const healthy: AlertInputs = {
  connector: { state: 'connected', target: 'alan', attempt: 0 },
  connectorStateMs: 60_000,
  screens: { audio: 1, alerts: 1 },
  queueDepth: { audio: 0 },
  diskFreePercent: 50,
  lastBackupAt: NOW - 3_600_000,
  now: NOW,
  uptimeMs: 3_600_000,
};
const codes = (i: Partial<AlertInputs>) => healthAlerts({ ...healthy, ...i }).map((a) => a.code);

describe('healthAlerts', () => {
  it('has nothing to say when all is well', () => {
    expect(codes({})).toEqual([]);
  });

  it('flags a connector that has been down for more than 30 s, not before', () => {
    const down = { state: 'reconnecting', target: 'alan', attempt: 2 } as const;
    expect(codes({ connector: down, connectorStateMs: 29_000 })).toEqual([]);
    expect(codes({ connector: down, connectorStateMs: 31_000 })).toContain('connector_down');
  });

  it('does not flag a connector the user stopped or never configured', () => {
    expect(
      codes({ connector: { state: 'stopped', target: 'alan', attempt: 0 }, connectorStateMs: 1e6 }),
    ).toEqual([]);
    expect(codes({ connector: { state: 'idle', attempt: 0 }, connectorStateMs: 1e6 })).toEqual([]);
  });

  it('flags a queue above 80 % of its capacity (50)', () => {
    expect(codes({ queueDepth: { audio: 40 } })).toEqual([]);
    expect(codes({ queueDepth: { audio: 41 } })).toEqual(['queue_full']);
  });

  it('flags a missing audio tab only during a live', () => {
    expect(codes({ screens: { alerts: 1 } })).toEqual(['audio_offline']);
    expect(codes({ screens: {}, connector: { state: 'idle', attempt: 0 } })).toEqual([]);
  });

  it('flags low disk, and ignores an unreadable one', () => {
    expect(codes({ diskFreePercent: 9.9 })).toEqual(['disk_low']);
    expect(codes({ diskFreePercent: null })).toEqual([]);
  });

  it('flags a stale backup after the boot grace period', () => {
    expect(codes({ lastBackupAt: NOW - 37 * 3_600_000 })).toEqual(['backup_stale']);
    expect(codes({ lastBackupAt: null })).toEqual(['backup_stale']);
    expect(codes({ lastBackupAt: null, uptimeMs: 30_000 })).toEqual([]);
  });
});
