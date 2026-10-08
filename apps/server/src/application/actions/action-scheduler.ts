import { makeEnvelope, type ScreenServerMessage } from '@tiklive/contracts';
import { ActionQueue, DEFAULT_QUEUE_CAPACITY } from '../../domain/queue/action-queue.js';
import type { PlannedAction } from '../../domain/rules/actions.js';
import type { Clock } from '../../domain/shared/time.js';
import type { Logger } from '../ports/logger.js';
import type { Cancel, Scheduler } from '../ports/scheduler.js';
import type { ScreenGateway } from '../ports/screen-gateway.js';

export const MAX_DISPATCH_ATTEMPTS = 3;
/** Actions waiting longer than this (e.g. no audio tab open) are dropped as stale. */
export const MAX_ACTION_AGE_MS = 60_000;

export type ActionOutcome = 'done' | 'failed' | 'timeout' | 'dropped';

export interface ActionSink {
  enqueue(action: PlannedAction): void;
}

interface QueuedAction extends PlannedAction {
  attempts: number;
  readonly enqueuedAt: number;
}

interface InFlight {
  readonly action: QueuedAction;
  readonly startedAt: number;
  readonly cancelTimeout: Cancel;
}

interface ScreenLane {
  readonly queue: ActionQueue<QueuedAction>;
  inFlight: InFlight | undefined;
}

interface SchedulerDeps {
  readonly gateway: ScreenGateway;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly onOutcome?: (action: PlannedAction, outcome: ActionOutcome, latencyMs: number) => void;
  readonly capacity?: number;
}

/**
 * Per-screen queues with concurrency 1: send, wait for action.done (or time out), then next.
 * Server owns all timing; screens only execute and acknowledge.
 */
export class ActionScheduler implements ActionSink {
  private readonly lanes = new Map<string, ScreenLane>();

  constructor(private readonly deps: SchedulerDeps) {
    deps.gateway.onScreenConnected((screen) => this.pump(screen));
    deps.gateway.onScreenDisconnected((screen) => this.handleDisconnect(screen));
  }

  enqueue(action: PlannedAction): void {
    const lane = this.lane(action.screen);
    const result = lane.queue.enqueue({
      ...action,
      attempts: 0,
      enqueuedAt: this.deps.clock.now(),
    });
    if (result.evicted) this.finish(result.evicted, 'dropped');
    if (!result.accepted) this.finish(action, 'dropped');
    this.pump(action.screen);
  }

  acknowledge(screen: string, actionId: string, ok: boolean, reason?: string): void {
    const lane = this.lanes.get(screen);
    const inFlight = lane?.inFlight;
    if (!lane || !inFlight || inFlight.action.actionId !== actionId) return;
    inFlight.cancelTimeout();
    lane.inFlight = undefined;
    if (!ok) this.deps.logger.warn({ actionId, screen, reason }, 'screen reported action failure');
    this.finish(inFlight.action, ok ? 'done' : 'failed', inFlight.startedAt);
    this.pump(screen);
  }

  clear(screen?: string): number {
    const targets = screen === undefined ? [...this.lanes.keys()] : [screen];
    let cleared = 0;
    for (const name of targets) {
      const dropped = this.lanes.get(name)?.queue.clear() ?? [];
      dropped.forEach((a) => this.finish(a, 'dropped'));
      cleared += dropped.length;
    }
    return cleared;
  }

  depths(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [screen, lane] of this.lanes)
      out[screen] = lane.queue.size + (lane.inFlight ? 1 : 0);
    return out;
  }

  private pump(screen: string): void {
    const lane = this.lanes.get(screen);
    if (!lane || lane.inFlight || this.deps.gateway.connectedCount(screen) === 0) return;
    const action = this.nextFresh(lane);
    if (action) this.dispatch(lane, action);
  }

  private nextFresh(lane: ScreenLane): QueuedAction | undefined {
    const now = this.deps.clock.now();
    for (let action = lane.queue.dequeue(); action; action = lane.queue.dequeue()) {
      if (now - action.enqueuedAt <= MAX_ACTION_AGE_MS) return action;
      this.finish(action, 'dropped');
    }
    return undefined;
  }

  private dispatch(lane: ScreenLane, action: QueuedAction): void {
    action.attempts++;
    const message = makeEnvelope(
      action.command.type,
      action.command.payload,
      this.deps.clock.now(),
    );
    if (!this.deps.gateway.send(action.screen, message as ScreenServerMessage)) {
      this.retryOrDrop(lane, action);
      return;
    }
    const cancelTimeout = this.deps.scheduler.setTimeout(
      () => this.handleTimeout(action.screen, action.actionId),
      action.timeoutMs,
    );
    lane.inFlight = { action, startedAt: this.deps.clock.now(), cancelTimeout };
  }

  private handleTimeout(screen: string, actionId: string): void {
    const lane = this.lanes.get(screen);
    const inFlight = lane?.inFlight;
    if (!lane || !inFlight || inFlight.action.actionId !== actionId) return;
    lane.inFlight = undefined;
    this.finish(inFlight.action, 'timeout', inFlight.startedAt);
    this.pump(screen);
  }

  private handleDisconnect(screen: string): void {
    const lane = this.lanes.get(screen);
    if (!lane?.inFlight || this.deps.gateway.connectedCount(screen) > 0) return;
    const { action, cancelTimeout } = lane.inFlight;
    cancelTimeout();
    lane.inFlight = undefined;
    this.retryOrDrop(lane, action);
  }

  private retryOrDrop(lane: ScreenLane, action: QueuedAction): void {
    if (action.attempts >= MAX_DISPATCH_ATTEMPTS) {
      this.finish(action, 'dropped');
      return;
    }
    lane.queue.requeueFront(action);
  }

  private finish(action: PlannedAction, outcome: ActionOutcome, startedAt?: number): void {
    const latency = startedAt === undefined ? 0 : this.deps.clock.now() - startedAt;
    const fields = {
      actionId: action.actionId,
      origin: `${action.origin.kind}:${action.origin.id}`,
      screenId: action.screen,
    };
    if (outcome === 'done')
      this.deps.logger.debug({ ...fields, durationMs: latency }, 'action done');
    else this.deps.logger.warn({ ...fields, outcome }, 'action not completed');
    this.deps.onOutcome?.(action, outcome, latency);
  }

  private lane(screen: string): ScreenLane {
    let lane = this.lanes.get(screen);
    if (!lane) {
      lane = {
        queue: new ActionQueue(this.deps.capacity ?? DEFAULT_QUEUE_CAPACITY),
        inFlight: undefined,
      };
      this.lanes.set(screen, lane);
    }
    return lane;
  }
}
