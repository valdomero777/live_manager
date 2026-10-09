import { z } from 'zod';
import { ConnectorStatusSchema } from './ws.js';

export const API_PREFIX = '/api/v1';

export const ConnectRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((u) => u.replace(/^@/, '')),
});
export type ConnectRequest = z.infer<typeof ConnectRequestSchema>;

export const HealthAlertSchema = z.object({
  code: z.enum(['connector_down', 'queue_full', 'audio_offline', 'disk_low', 'backup_stale']),
  message: z.string(),
});
export type HealthAlert = z.infer<typeof HealthAlertSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptimeS: z.number(),
  version: z.string(),
  connector: ConnectorStatusSchema,
  db: z.enum(['ok', 'down']),
  screens: z.record(z.string(), z.number()),
  queueDepth: z.record(z.string(), z.number()),
  process: z.object({ rssBytes: z.number(), eventLoopLagMs: z.number() }),
  /** Free space of the data volume, in percent; null when it cannot be read. */
  diskFreePercent: z.number().nullable(),
  /** Timestamp of the newest database backup; null when none is known yet. */
  lastBackupAt: z.number().nullable(),
  /** Things worth the streamer's attention right now (spec 15). */
  alerts: z.array(HealthAlertSchema),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** RFC 9457 problem details. */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;
