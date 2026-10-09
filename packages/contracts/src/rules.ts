import { z } from 'zod';
import { LIVE_EVENT_TYPES } from './events.js';

export const RULE_SCHEMA_VERSION = 1;

const numericOp = z.enum(['eq', 'gte', 'lte', 'gt', 'lt']);
export type NumericOp = z.infer<typeof numericOp>;

export const ConditionConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('giftName'),
    op: z.enum(['eq', 'neq', 'contains']),
    value: z.string().min(1),
  }),
  z.object({ type: z.literal('giftId'), op: z.enum(['eq', 'neq']), value: z.number().int() }),
  z.object({
    type: z.literal('diamondsTotal'),
    op: numericOp,
    value: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('quantity'), op: numericOp, value: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('likesCumulative'),
    /** every: fires each time the viewer's session likes cross a multiple of value. */
    mode: z.enum(['every', 'threshold']),
    value: z.number().int().positive(),
  }),
  z.object({ type: z.literal('userRole'), role: z.enum(['follower', 'subscriber', 'moderator']) }),
  z.object({
    type: z.literal('keyword'),
    match: z.enum(['contains', 'startsWith', 'equals', 'regex']),
    value: z.string().min(1).max(200),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({ type: z.literal('firstTime') }),
]);
export type ConditionConfig = z.infer<typeof ConditionConfigSchema>;
export type ConditionType = ConditionConfig['type'];

const volume = z.number().min(0).max(1);

/** Actions that run on a screen (audio, alerts) and wait for its action.done. */
export const ScreenActionConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('playSound'),
    screen: z.string().default('audio'),
    assetId: z.number().int().positive(),
    volume: volume.default(0.8),
    maxMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('showAlert'),
    screen: z.string().default('alerts'),
    assetId: z.number().int().positive().optional(),
    text: z.string().max(500),
    durationMs: z.number().int().min(500).max(60_000).default(5000),
  }),
  z.object({
    type: z.literal('speak'),
    screen: z.string().default('audio'),
    text: z.string().max(500),
    voice: z.string().optional(),
    rate: z.number().min(0.1).max(4).optional(),
    pitch: z.number().min(0).max(2).optional(),
    volume: volume.default(1),
  }),
]);
export type ScreenActionConfig = z.infer<typeof ScreenActionConfigSchema>;

export const WEBHOOK_BODY_MAX = 2000;

/** Actions the server runs itself (spec 9). Goals do not accept them: no goal -> goal loops. */
export const ServerActionConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('updateGoal'),
    goalId: z.number().int().positive(),
    /** Added to the goal's progress; negative values take progress back. */
    amount: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, 'amount must not be 0'),
  }),
  z.object({
    type: z.literal('webhook'),
    url: z.url({ protocol: /^https?$/ }).max(2000),
    method: z.enum(['POST', 'PUT']).default('POST'),
    /** JSON text with {placeholders}; each value is escaped so the result stays valid JSON. */
    body: z.string().max(WEBHOOK_BODY_MAX).default('{}'),
  }),
]);
export type ServerActionConfig = z.infer<typeof ServerActionConfigSchema>;

export const ActionConfigSchema = z.discriminatedUnion('type', [
  ...ScreenActionConfigSchema.options,
  ...ServerActionConfigSchema.options,
]);
export type ActionConfig = z.infer<typeof ActionConfigSchema>;
export type ActionType = ActionConfig['type'];

export const RuleDefinitionSchema = z.object({
  schemaVersion: z.literal(RULE_SCHEMA_VERSION).default(RULE_SCHEMA_VERSION),
  name: z.string().min(1).max(100),
  trigger: z.enum(LIVE_EVENT_TYPES),
  conditions: z.array(ConditionConfigSchema).default([]),
  mode: z.enum(['all', 'random']).default('all'),
  cooldownMs: z.number().int().nonnegative().default(0),
  userCooldownMs: z.number().int().nonnegative().default(0),
  probability: z.number().min(0).max(1).default(1),
  priority: z.number().int().min(0).max(100).default(0),
  enabled: z.boolean().default(true),
  actions: z.array(ActionConfigSchema).min(1),
});
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;
export type RuleDefinitionInput = z.input<typeof RuleDefinitionSchema>;

export const RuleSchema = RuleDefinitionSchema.extend({
  id: z.number().int().positive(),
  version: z.number().int().positive(),
});
export type Rule = z.infer<typeof RuleSchema>;

// ---------- Rule test (POST /rules/:id/test) ----------

/** Optional overrides for the sample event; anything missing gets a sensible default. */
export const RuleTestRequestSchema = z.object({
  user: z.string().trim().min(1).max(40).optional(),
  giftName: z.string().trim().min(1).max(60).optional(),
  giftId: z.number().int().optional(),
  diamonds: z.number().int().nonnegative().optional(),
  quantity: z.number().int().positive().optional(),
  text: z.string().max(300).optional(),
  likes: z.number().int().positive().optional(),
});
export type RuleTestRequest = z.infer<typeof RuleTestRequestSchema>;

export const RuleTestResultSchema = z.object({
  matched: z.boolean(),
  conditions: z.array(z.object({ type: z.string(), ok: z.boolean() })),
  /** Actions sent to the screens (cooldown and probability are skipped in a test). */
  actionsQueued: z.number().int().nonnegative(),
  actionsSkipped: z.number().int().nonnegative(),
});
export type RuleTestResult = z.infer<typeof RuleTestResultSchema>;
