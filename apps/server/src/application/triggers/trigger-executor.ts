import {
  isAllowedSoundUrl,
  type LiveEvent,
  type LiveEventType,
  type Trigger,
  type TriggerExecuteResult,
} from '@tiklive/contracts';
import {
  ACK_GRACE_MS,
  DEFAULT_SOUND_TIMEOUT_MS,
  type PlannedAction,
} from '../../domain/rules/actions.js';
import type { ActionSink } from '../actions/action-scheduler.js';
import type { LiveEventConsumer } from '../ingest/ingest-live-event.js';
import type { Logger } from '../ports/logger.js';
import type { Clock, Random } from '../../domain/shared/time.js';
import type { IdGenerator } from '../ports/scheduler.js';
import type { TriggerRepository } from '../ports/trigger-repository.js';

/** Sounds play on the same OBS/browser audio screen as rule actions. */
export const TRIGGER_SCREEN = 'audio';

export interface ExecuteOptions {
  /** A manual test: runs even if the trigger is disabled, without touching its configuration. */
  readonly test?: boolean;
  readonly eventId?: string;
}

interface ExecutorDeps {
  readonly repo: TriggerRepository;
  readonly sink: ActionSink;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly random: Random;
  readonly logger: Logger;
}

/**
 * Turns stored triggers into audio actions. Enabled triggers are cached by event type so the
 * ingest hot path never queries the database; every write calls reload().
 */
export class TriggerExecutor implements LiveEventConsumer {
  private byEvent = new Map<LiveEventType, Trigger[]>();
  /** When each trigger last played, for its cooldown. Cleared by reload(): an edit starts fresh. */
  private lastPlayed = new Map<number, number>();

  constructor(private readonly deps: ExecutorDeps) {}

  async reload(): Promise<void> {
    const next = new Map<LiveEventType, Trigger[]>();
    for (const trigger of await this.deps.repo.listAll()) {
      if (!trigger.enabled) continue;
      next.set(trigger.event, [...(next.get(trigger.event) ?? []), trigger]);
    }
    this.byEvent = next;
    this.lastPlayed.clear();
  }

  handle(event: LiveEvent): void {
    for (const trigger of this.byEvent.get(event.type) ?? []) {
      if (!this.shouldPlay(trigger)) continue;
      if (this.execute(trigger, { eventId: event.id }) === 'queued')
        this.lastPlayed.set(trigger.id, this.deps.clock.now());
    }
  }

  /** Cooldown first, so a trigger on cooldown does not spend its probability roll. */
  private shouldPlay(trigger: Trigger): boolean {
    const last = this.lastPlayed.get(trigger.id);
    if (last !== undefined && this.deps.clock.now() - last < trigger.cooldownMs) return false;
    return trigger.probability >= 1 || this.deps.random.next() < trigger.probability;
  }

  /** Validates the trigger and queues its sound; the URL is the one saved with the trigger. */
  execute(trigger: Trigger, options: ExecuteOptions = {}): TriggerExecuteResult['status'] {
    if (!trigger.enabled && !options.test) return 'disabled';
    if (!trigger.soundUrl || !isAllowedSoundUrl(trigger.soundUrl, trigger.source)) {
      this.deps.logger.warn({ triggerId: trigger.id }, 'trigger has no playable sound URL');
      return 'invalid';
    }
    this.deps.sink.enqueue(this.plan(trigger, options.eventId ?? `test-${trigger.id}`));
    return 'queued';
  }

  private plan(trigger: Trigger, eventId: string): PlannedAction {
    const actionId = this.deps.ids.next();
    return {
      actionId,
      screen: TRIGGER_SCREEN,
      priority: 0,
      origin: { kind: 'trigger', id: trigger.id },
      eventId,
      timeoutMs: (trigger.maxMs ?? DEFAULT_SOUND_TIMEOUT_MS) + ACK_GRACE_MS,
      command: {
        type: 'action.play_sound',
        payload: {
          actionId,
          url: trigger.soundUrl,
          volume: trigger.volume,
          triggerId: trigger.id,
          ...(trigger.maxMs === undefined ? {} : { maxMs: trigger.maxMs }),
        },
      },
    };
  }
}
