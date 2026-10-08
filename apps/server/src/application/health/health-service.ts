import type { HealthResponse } from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { ActionScheduler } from '../actions/action-scheduler.js';
import type { ConnectorSupervisor } from '../connector/connector-supervisor.js';
import type { ScreenGateway } from '../ports/screen-gateway.js';

interface HealthDeps {
  readonly supervisor: ConnectorSupervisor;
  readonly actions: ActionScheduler;
  readonly screens: ScreenGateway;
  readonly isDbHealthy: () => boolean;
  readonly clock: Clock;
  readonly startedAt: number;
  readonly version: string;
}

export class HealthService {
  constructor(private readonly deps: HealthDeps) {}

  check(): HealthResponse {
    const dbOk = this.deps.isDbHealthy();
    return {
      status: dbOk ? 'ok' : 'degraded',
      uptimeS: Math.round((this.deps.clock.now() - this.deps.startedAt) / 1000),
      version: this.deps.version,
      connector: this.deps.supervisor.status(),
      db: dbOk ? 'ok' : 'down',
      screens: this.deps.screens.connectedScreens(),
      queueDepth: this.deps.actions.depths(),
    };
  }
}
