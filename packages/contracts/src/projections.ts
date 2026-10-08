import { z } from 'zod';
import { ActionConfigSchema } from './rules.js';

// ---------- Leaderboards ----------

export const METRICS = ['diamonds', 'gift_count', 'likes'] as const;
export const MetricSchema = z.enum(METRICS);
export type Metric = z.infer<typeof MetricSchema>;

export const SCOPES = ['session', 'week', 'total'] as const;
export const ScopeSchema = z.enum(SCOPES);
export type Scope = z.infer<typeof ScopeSchema>;

/** Largest top-N the server publishes; overlays slice to their own `limit`. */
export const MAX_LEADERBOARD_LIMIT = 20;

export const LeaderboardRowSchema = z.object({
  rank: z.number().int().positive(),
  viewerId: z.number().int(),
  uniqueId: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  value: z.number().int().nonnegative(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRowSchema>;

export const LeaderboardSnapshotSchema = z.object({
  metric: MetricSchema,
  scope: ScopeSchema,
  /** Monotonic per channel: overlays drop snapshots older than the last one applied. */
  seq: z.number().int().nonnegative(),
  rows: z.array(LeaderboardRowSchema),
});
export type LeaderboardSnapshot = z.infer<typeof LeaderboardSnapshotSchema>;

export const LeaderboardResetSchema = z
  .object({ scope: ScopeSchema, confirm: z.boolean().default(false) })
  .refine((r) => r.scope !== 'total' || r.confirm, {
    message: 'Resetting the total scope requires confirm: true',
    path: ['confirm'],
  });

export const LeaderboardSettingsSchema = z.object({
  /** uniqueIds hidden from every ranking (privacy option). */
  excludedUniqueIds: z.array(z.string().min(1)).max(500).default([]),
});
export type LeaderboardSettings = z.infer<typeof LeaderboardSettingsSchema>;

// ---------- Goals ----------

export const GOAL_METRICS = ['diamonds', 'gifts', 'likes'] as const;
export const GoalMetricSchema = z.enum(GOAL_METRICS);
export type GoalMetric = z.infer<typeof GoalMetricSchema>;

export const GoalDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  metric: GoalMetricSchema,
  target: z.number().int().positive(),
  scope: z.enum(['session', 'total']).default('session'),
  /** Actions run once per reached cycle (sound, alert, speech). */
  onReach: z.array(ActionConfigSchema).default([]),
  /** When set, a reached goal starts a new cycle with target x repeatFactor. */
  repeatFactor: z.number().min(1.01).max(100).nullable().default(null),
  active: z.boolean().default(true),
});
export type GoalDefinition = z.infer<typeof GoalDefinitionSchema>;
export type GoalDefinitionInput = z.input<typeof GoalDefinitionSchema>;

export const GoalSchema = GoalDefinitionSchema.extend({ id: z.number().int().positive() });
export type Goal = z.infer<typeof GoalSchema>;

export const GoalProgressSchema = z.object({
  goalId: z.number().int(),
  name: z.string(),
  metric: GoalMetricSchema,
  current: z.number().int().nonnegative(),
  target: z.number().int().positive(),
  ratio: z.number().min(0).max(1),
  cycle: z.number().int().positive(),
  reached: z.boolean(),
  seq: z.number().int().nonnegative(),
});
export type GoalProgress = z.infer<typeof GoalProgressSchema>;

// ---------- Stats ----------

const lastViewer = z.object({ nickname: z.string(), uniqueId: z.string() });

export const StatsSnapshotSchema = z.object({
  sessionId: z.number().int().nullable(),
  startedAt: z.number().int().nullable(),
  viewers: z.number().int().nonnegative(),
  peakViewers: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  diamonds: z.number().int().nonnegative(),
  newFollowers: z.number().int().nonnegative(),
  lastGift: lastViewer
    .extend({ giftName: z.string(), quantity: z.number().int(), diamonds: z.number().int() })
    .nullable(),
  lastFollower: lastViewer.nullable(),
  topGift: lastViewer
    .extend({ giftName: z.string(), quantity: z.number().int(), diamonds: z.number().int() })
    .nullable(),
  seq: z.number().int().nonnegative(),
});
export type StatsSnapshot = z.infer<typeof StatsSnapshotSchema>;
export const STATS_FIELDS = [
  'viewers',
  'peakViewers',
  'likes',
  'diamonds',
  'newFollowers',
  'duration',
] as const;
export type StatsField = (typeof STATS_FIELDS)[number];

// ---------- Subscriptions (overlay -> server, inside client.hello) ----------

export const SubscriptionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('leaderboard'), metric: MetricSchema, scope: ScopeSchema }),
  z.object({ kind: z.literal('goal'), goalId: z.number().int().positive() }),
  z.object({ kind: z.literal('stats') }),
]);
export type Subscription = z.infer<typeof SubscriptionSchema>;

/** Stable channel name for a subscription, e.g. "leaderboard:diamonds:session". */
export function channelOf(s: Subscription): string {
  if (s.kind === 'leaderboard') return `leaderboard:${s.metric}:${s.scope}`;
  if (s.kind === 'goal') return `goal:${s.goalId}`;
  return 'stats';
}

// ---------- Rotator ----------

const panelBase = { durationMs: z.number().int().min(2_000).max(120_000).default(10_000) };

export const RotatorPanelSchema = z.discriminatedUnion('type', [
  z.object({
    ...panelBase,
    type: z.literal('leaderboard'),
    metric: MetricSchema,
    scope: ScopeSchema.default('session'),
    limit: z.number().int().min(1).max(MAX_LEADERBOARD_LIMIT).default(5),
    title: z.string().max(60).optional(),
  }),
  z.object({ ...panelBase, type: z.literal('goal'), goalId: z.number().int().positive() }),
  z.object({
    ...panelBase,
    type: z.literal('stats'),
    fields: z.array(z.enum(STATS_FIELDS)).min(1).default(['viewers', 'likes', 'diamonds']),
  }),
]);
export type RotatorPanel = z.infer<typeof RotatorPanelSchema>;

export const RotatorConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  transition: z.enum(['fade', 'none']).default('fade'),
  panels: z.array(RotatorPanelSchema).min(1).max(12),
});
export type RotatorConfig = z.infer<typeof RotatorConfigSchema>;
export type RotatorConfigInput = z.input<typeof RotatorConfigSchema>;

export function subscriptionsOf(config: RotatorConfig): Subscription[] {
  return config.panels.map((p): Subscription => {
    if (p.type === 'leaderboard') return { kind: 'leaderboard', metric: p.metric, scope: p.scope };
    if (p.type === 'goal') return { kind: 'goal', goalId: p.goalId };
    return { kind: 'stats' };
  });
}
