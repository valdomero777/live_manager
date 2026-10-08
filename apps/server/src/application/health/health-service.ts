import type { HealthResponse } from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { ActionScheduler } from '../actions/action-scheduler.js';
import type { ConnectorSupervisor } from '../connector/connector-supervisor.js';
import type { ScreenGateway } from '../ports/screen-gateway.js';
import { healthAlerts } from './health-alerts.js';

interface HealthDeps {
  readonly supervisor: ConnectorSupervisor;
  readonly actions: ActionScheduler;
  readonly screens: ScreenGateway;
  readonly isDbHealthy: () => boolean;
  readonly diskFreePercent: () => Promise<number | null>;
  readonly lastBackupAt: () => number | null;
  readonly processStats: () => { rssBytes: number; eventLoopLagMs: number };
  readonly clock: Clock;
  readonly startedAt: number;
  readonly version: string;
}

export class HealthService {
  private lastState: string | undefined;
  private stateSince: number;

  constructor(private readonly deps: HealthDeps) {
    this.stateSince = deps.startedAt;
  }

  async check(): Promise<HealthResponse> {
    const now = this.deps.clock.now();
    const dbOk = this.deps.isDbHealthy();
    const connector = this.deps.supervisor.status();
    if (connector.state !== this.lastState) {
      this.lastState = connector.state;
      this.stateSince = now;
    }
    const screens = this.deps.screens.connectedScreens();
    const queueDepth = this.deps.actions.depths();
    const diskFreePercent = await this.deps.diskFreePercent();
    const lastBackupAt = this.deps.lastBackupAt();
    return {
      status: dbOk ? 'ok' : 'degraded',
      uptimeS: Math.round((now - this.deps.startedAt) / 1000),
      version: this.deps.version,
      connector,
      db: dbOk ? 'ok' : 'down',
      screens,
      queueDepth,
      process: this.deps.processStats(),
      diskFreePercent,
      lastBackupAt,
      alerts: healthAlerts({
        connector,
        connectorStateMs: now - this.stateSince,
        screens,
        queueDepth,
        diskFreePercent,
        lastBackupAt,
        now,
        uptimeMs: now - this.deps.startedAt,
      }),
    };
  }
}
