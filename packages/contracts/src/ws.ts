import { z } from 'zod';
import { LiveEventSchema } from './events.js';
import {
  GoalProgressSchema,
  LeaderboardSnapshotSchema,
  StatsSnapshotSchema,
  SubscriptionSchema,
} from './projections.js';
import { RawLiveEventSchema } from './raw-events.js';

export const WS_VERSION = 1;

/** Common envelope: { v, type, ts, payload }. */
function envelope<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({
    v: z.literal(WS_VERSION),
    type: z.literal(type),
    ts: z.number().int(),
    payload,
  });
}

// ---------- Screen channel: server -> client ----------

const actionBase = { actionId: z.string().min(1) };

export const PlaySoundMessageSchema = envelope(
  'action.play_sound',
  z.object({
    ...actionBase,
    url: z.string(),
    volume: z.number().min(0).max(1),
    /** Set when a sound trigger (not a rule) produced the action. */
    triggerId: z.number().int().positive().optional(),
    maxMs: z.number().int().positive().optional(),
  }),
);

export const ShowAlertMessageSchema = envelope(
  'action.show_alert',
  z.object({
    ...actionBase,
    imageUrl: z.string().optional(),
    text: z.string(),
    durationMs: z.number().int().positive(),
  }),
);

export const SpeakMessageSchema = envelope(
  'action.speak',
  z.object({
    ...actionBase,
    text: z.string(),
    voice: z.string().optional(),
    rate: z.number().optional(),
    pitch: z.number().optional(),
    volume: z.number().min(0).max(1),
  }),
);

export const ConfigChangedMessageSchema = envelope(
  'config.changed',
  z.object({ preloadUrls: z.array(z.string()) }),
);

export const PongMessageSchema = envelope('pong', z.object({}));

export const LeaderboardSnapshotMessageSchema = envelope(
  'leaderboard.snapshot',
  LeaderboardSnapshotSchema,
);
export const GoalProgressMessageSchema = envelope('goal.progress', GoalProgressSchema);
export const StatsSnapshotMessageSchema = envelope('stats.snapshot', StatsSnapshotSchema);

export const ScreenServerMessageSchema = z.discriminatedUnion('type', [
  PlaySoundMessageSchema,
  ShowAlertMessageSchema,
  SpeakMessageSchema,
  ConfigChangedMessageSchema,
  PongMessageSchema,
  LeaderboardSnapshotMessageSchema,
  GoalProgressMessageSchema,
  StatsSnapshotMessageSchema,
]);
export type ScreenServerMessage = z.infer<typeof ScreenServerMessageSchema>;
export type ScreenActionMessage = Extract<
  ScreenServerMessage,
  { type: 'action.play_sound' | 'action.show_alert' | 'action.speak' }
>;

// ---------- Screen channel: client -> server ----------

export const ScreenClientMessageSchema = z.discriminatedUnion('type', [
  envelope(
    'client.hello',
    z.object({
      screenId: z.string().min(1),
      clientVersion: z.string(),
      /** Data channels this overlay wants (leaderboards, goals, stats). */
      subscriptions: z.array(SubscriptionSchema).max(20).default([]),
    }),
  ),
  envelope('action.done', z.object({ actionId: z.string(), durationMs: z.number().nonnegative() })),
  envelope('action.failed', z.object({ actionId: z.string(), reason: z.string().max(500) })),
  envelope('ping', z.object({})),
]);
export type ScreenClientMessage = z.infer<typeof ScreenClientMessageSchema>;

// ---------- Admin channel ----------

export const CONNECTOR_STATES = [
  'idle',
  'connecting',
  'connected',
  'waiting_host',
  'reconnecting',
  'stopped',
] as const;
export const ConnectorStateSchema = z.enum(CONNECTOR_STATES);
export type ConnectorState = z.infer<typeof ConnectorStateSchema>;

export const ConnectorStatusSchema = z.object({
  state: ConnectorStateSchema,
  target: z.string().optional(),
  attempt: z.number().int().nonnegative(),
  nextRetryAt: z.number().int().optional(),
  lastError: z.string().optional(),
});
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

export const AdminServerMessageSchema = z.discriminatedUnion('type', [
  envelope('connector.status', ConnectorStatusSchema),
  envelope('event.received', LiveEventSchema),
  envelope(
    'rule.executed',
    z.object({
      ruleId: z.number(),
      eventId: z.string(),
      result: z.enum(['executed', 'limited', 'failed']),
    }),
  ),
  envelope('queue.stats', z.record(z.string(), z.number())),
  envelope('error.reported', z.object({ module: z.string(), message: z.string() })),
]);
export type AdminServerMessage = z.infer<typeof AdminServerMessageSchema>;
export type AdminMessageType = AdminServerMessage['type'];
export type AdminPayload<T extends AdminMessageType> = Extract<
  AdminServerMessage,
  { type: T }
>['payload'];

export const AdminClientMessageSchema = z.discriminatedUnion('type', [
  envelope('simulator.emit', RawLiveEventSchema),
  envelope('queue.clear', z.object({ screen: z.string().optional() })),
  envelope('session.reset', z.object({})),
]);
export type AdminClientMessage = z.infer<typeof AdminClientMessageSchema>;

/** Builds an envelope with the current version; ts is supplied by the caller's clock. */
export function makeEnvelope<T extends string, P>(type: T, payload: P, ts: number) {
  return { v: WS_VERSION, type, ts, payload } as const;
}
