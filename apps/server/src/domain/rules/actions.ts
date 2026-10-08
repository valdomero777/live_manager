import type { ActionConfig, ScreenActionMessage } from '@tiklive/contracts';
import { UnknownActionError } from '../shared/errors.js';
import { resolveTemplate, type TemplateVariables } from './template.js';

/** A screen message without its envelope fields; the dispatcher stamps v/ts on send. */
export type ScreenCommand = {
  [M in ScreenActionMessage as M['type']]: {
    readonly type: M['type'];
    readonly payload: M['payload'];
  };
}[ScreenActionMessage['type']];

/** What produced an action: a rule match or a reached goal. */
export interface ActionOrigin {
  readonly kind: 'rule' | 'goal' | 'trigger';
  readonly id: number;
}

export interface PlannedAction {
  readonly actionId: string;
  readonly screen: string;
  readonly priority: number;
  readonly origin: ActionOrigin;
  readonly eventId: string;
  /** How long to wait for action.done before marking the action as failed. */
  readonly timeoutMs: number;
  readonly command: ScreenCommand;
}

/** Read-only view of the asset library needed to plan actions. */
export interface AssetCatalog {
  urlFor(assetId: number): string | undefined;
}

export interface PlanContext {
  readonly actionId: string;
  readonly origin: ActionOrigin;
  readonly eventId: string;
  readonly priority: number;
  readonly vars: TemplateVariables;
  readonly assets: AssetCatalog;
}

/** Strategy per action type. plan() is pure: no I/O. Returns null when it cannot run. */
export interface ActionHandler<T extends ActionConfig = ActionConfig> {
  readonly type: T['type'];
  plan(config: T, ctx: PlanContext): PlannedAction | null;
}

export const ACK_GRACE_MS = 2_000;
export const DEFAULT_SOUND_TIMEOUT_MS = 15_000;
/** Rough upper bound for speech: ~80 ms per character plus a fixed margin. */
const SPEECH_MS_PER_CHAR = 80;
const SPEECH_BASE_MS = 3_000;

function base(ctx: PlanContext, screen: string, timeoutMs: number) {
  return {
    actionId: ctx.actionId,
    screen,
    priority: ctx.priority,
    origin: ctx.origin,
    eventId: ctx.eventId,
    timeoutMs: timeoutMs + ACK_GRACE_MS,
  };
}

type Cfg<K extends ActionConfig['type']> = Extract<ActionConfig, { type: K }>;

export const playSoundHandler: ActionHandler<Cfg<'playSound'>> = {
  type: 'playSound',
  plan(config, ctx) {
    const url = ctx.assets.urlFor(config.assetId);
    if (!url) return null;
    const payload = { actionId: ctx.actionId, url, volume: config.volume };
    return {
      ...base(ctx, config.screen, config.maxMs ?? DEFAULT_SOUND_TIMEOUT_MS),
      command: {
        type: 'action.play_sound',
        payload: config.maxMs === undefined ? payload : { ...payload, maxMs: config.maxMs },
      },
    };
  },
};

export const showAlertHandler: ActionHandler<Cfg<'showAlert'>> = {
  type: 'showAlert',
  plan(config, ctx) {
    const imageUrl = config.assetId === undefined ? undefined : ctx.assets.urlFor(config.assetId);
    const payload = {
      actionId: ctx.actionId,
      text: resolveTemplate(config.text, ctx.vars),
      durationMs: config.durationMs,
    };
    return {
      ...base(ctx, config.screen, config.durationMs),
      command: {
        type: 'action.show_alert',
        payload: imageUrl ? { ...payload, imageUrl } : payload,
      },
    };
  },
};

export const speakHandler: ActionHandler<Cfg<'speak'>> = {
  type: 'speak',
  plan(config, ctx) {
    const text = resolveTemplate(config.text, ctx.vars).trim();
    if (text.length === 0) return null;
    const { voice, rate, pitch } = config;
    return {
      ...base(ctx, config.screen, SPEECH_BASE_MS + text.length * SPEECH_MS_PER_CHAR),
      command: {
        type: 'action.speak',
        payload: {
          actionId: ctx.actionId,
          text,
          volume: config.volume,
          ...(voice === undefined ? {} : { voice }),
          ...(rate === undefined ? {} : { rate }),
          ...(pitch === undefined ? {} : { pitch }),
        },
      },
    };
  },
};

export class ActionHandlerRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  register<T extends ActionConfig>(handler: ActionHandler<T>): this {
    this.handlers.set(handler.type, handler);
    return this;
  }

  plan(config: ActionConfig, ctx: PlanContext): PlannedAction | null {
    const handler = this.handlers.get(config.type);
    if (!handler) throw new UnknownActionError(config.type);
    return handler.plan(config, ctx);
  }
}

export function createDefaultActionRegistry(): ActionHandlerRegistry {
  return new ActionHandlerRegistry()
    .register(playSoundHandler)
    .register(showAlertHandler)
    .register(speakHandler);
}
