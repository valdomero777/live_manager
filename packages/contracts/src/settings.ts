import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

/** Minimum length for the read-only overlay token; rotated keys are generated longer. */
export const MIN_OVERLAY_KEY_LENGTH = 16;

const tiktokUser = z
  .string()
  .trim()
  .max(64)
  .transform((u) => u.replace(/^@/, ''))
  .refine((u) => u === '' || /^[\w.]{2,64}$/.test(u), 'Usuario de TikTok no válido');

/**
 * Every setting that used to live only in environment variables. The UI edits these; the
 * server resolves each one as: value saved from the UI > environment variable > default.
 */
export const SettingsValuesSchema = z.object({
  port: z.number().int().min(0).max(65535),
  host: z.string().trim().min(1).max(255),
  dbPath: z.string().trim().min(1).max(500),
  assetsDir: z.string().trim().min(1).max(500),
  overlaysDir: z.string().trim().min(1).max(500),
  tiktokUsername: tiktokUser,
  simulate: z.boolean(),
  signApiKey: z.string().trim().max(200),
  overlayKey: z
    .string()
    .trim()
    .min(MIN_OVERLAY_KEY_LENGTH)
    .max(200)
    .regex(/^[\w-]+$/, 'Solo letras, números, - y _'),
  logLevel: z.enum(LOG_LEVELS),
});
export type SettingsValues = z.infer<typeof SettingsValuesSchema>;
export type SettingKey = keyof SettingsValues;

/** How a change takes effect: immediately, by reconnecting to TikTok, or after a restart. */
export type ApplyMode = 'live' | 'reconnect' | 'restart';

export interface SettingFieldMeta {
  readonly env: string;
  readonly apply: ApplyMode;
  /** Secrets are never sent back to the browser, only whether they are set. */
  readonly secret: boolean;
}

export const SETTING_FIELDS: Readonly<Record<SettingKey, SettingFieldMeta>> = {
  port: { env: 'PORT', apply: 'restart', secret: false },
  host: { env: 'HOST', apply: 'restart', secret: false },
  dbPath: { env: 'DB_PATH', apply: 'restart', secret: false },
  assetsDir: { env: 'ASSETS_DIR', apply: 'restart', secret: false },
  overlaysDir: { env: 'OVERLAYS_DIR', apply: 'restart', secret: false },
  tiktokUsername: { env: 'TIKTOK_USERNAME', apply: 'reconnect', secret: false },
  simulate: { env: 'SIMULATE', apply: 'restart', secret: false },
  signApiKey: { env: 'TIKTOK_SIGN_API_KEY', apply: 'restart', secret: true },
  overlayKey: { env: 'OVERLAY_KEY', apply: 'live', secret: false },
  logLevel: { env: 'LOG_LEVEL', apply: 'live', secret: false },
};

export const SETTING_KEYS = Object.keys(SETTING_FIELDS) as SettingKey[];

export type SettingSource = 'ui' | 'env' | 'default';

export const SettingViewSchema = z.object({
  /** Omitted for secrets. */
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  isSet: z.boolean(),
  source: z.enum(['ui', 'env', 'default']),
  env: z.string(),
  apply: z.enum(['live', 'reconnect', 'restart']),
  secret: z.boolean(),
  /** True when the saved value differs from the one the running server uses. */
  pendingRestart: z.boolean(),
});
export type SettingView = z.infer<typeof SettingViewSchema>;

export const SettingsResponseSchema = z.object({
  fields: z.record(z.string(), SettingViewSchema),
  restartPending: z.boolean(),
  configPath: z.string(),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

/** PATCH semantics: a value sets the UI override, null removes it (falls back to env/default). */
export const SettingsPatchSchema = z
  .object(
    Object.fromEntries(
      SETTING_KEYS.map((k) => [k, SettingsValuesSchema.shape[k].nullable().optional()]),
    ) as {
      [K in SettingKey]: z.ZodOptional<z.ZodNullable<(typeof SettingsValuesSchema.shape)[K]>>;
    },
  )
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const SettingsUpdateResultSchema = SettingsResponseSchema.extend({
  applied: z.array(z.string()),
  restartRequired: z.array(z.string()),
});
export type SettingsUpdateResult = z.infer<typeof SettingsUpdateResultSchema>;

// ---------- TTS moderation (stored in the database, applied live) ----------

export const ModerationSettingsSchema = z.object({
  maxLength: z.number().int().min(10).max(500).default(150),
  blockedTerms: z.array(z.string().trim().min(1).max(60)).max(1000).default([]),
  blockMode: z.enum(['drop', 'mask']).default('drop'),
  readMentions: z.boolean().default(false),
  stripEmojis: z.boolean().default(true),
  maxPerUserPerMinute: z.number().int().min(1).max(60).default(3),
  duplicateWindowMs: z.number().int().min(0).max(600_000).default(30_000),
  pronunciations: z
    .record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(80))
    .default({}),
});
export type ModerationSettings = z.infer<typeof ModerationSettingsSchema>;

// ---------- Authentication ----------

export const MIN_PASSWORD_LENGTH = 8;
const password = z.string().min(MIN_PASSWORD_LENGTH).max(200);

export const AuthStatusSchema = z.object({
  authenticated: z.boolean(),
  setupRequired: z.boolean(),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const LoginRequestSchema = z.object({ password: z.string().min(1).max(200) });
export const SetupRequestSchema = z.object({ code: z.string().trim().min(1).max(20), password });
export const ChangePasswordRequestSchema = z.object({
  current: z.string().min(1).max(200),
  next: password,
});
