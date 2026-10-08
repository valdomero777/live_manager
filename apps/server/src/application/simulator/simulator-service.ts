import {
  expandSimulatorTemplate,
  type RawLiveEvent,
  type SimulatorTemplate,
} from '@tiklive/contracts';
import { LruSet } from '../../domain/shared/lru-set.js';
import type { Clock } from '../../domain/shared/time.js';
import type { ConnectorSupervisor } from '../connector/connector-supervisor.js';
import type { LiveEventPipeline } from '../ingest/live-event-pipeline.js';
import type { IdGenerator } from '../ports/scheduler.js';

export const SIMULATOR_TARGET = 'simulator';
const IDEMPOTENCY_CAPACITY = 1_000;

/**
 * Injects synthetic events into the same pipeline as the live connector (RF-04). When the
 * connector has a target, simulated events join that session; otherwise a "simulator" session.
 */
export class SimulatorService {
  private readonly seenKeys = new LruSet(IDEMPOTENCY_CAPACITY);

  constructor(
    private readonly pipeline: LiveEventPipeline,
    private readonly supervisor: ConnectorSupervisor,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** A repeated idempotency key is accepted but not re-emitted. */
  emitTemplate(template: SimulatorTemplate, idempotencyKey?: string): RawLiveEvent[] {
    if (idempotencyKey !== undefined && !this.seenKeys.add(idempotencyKey)) return [];
    const raws = expandSimulatorTemplate(
      template,
      this.clock.now(),
      () => `sim-${this.ids.next()}`,
    );
    raws.forEach((raw) => this.emitRaw(raw));
    return raws;
  }

  emitRaw(raw: RawLiveEvent): void {
    this.pipeline.accept(raw, this.supervisor.status().target ?? SIMULATOR_TARGET);
  }
}
