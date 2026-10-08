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

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptimeS: z.number(),
  version: z.string(),
  connector: ConnectorStatusSchema,
  db: z.enum(['ok', 'down']),
  screens: z.record(z.string(), z.number()),
  queueDepth: z.record(z.string(), z.number()),
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
