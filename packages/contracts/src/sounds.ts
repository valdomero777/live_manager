import { z } from 'zod';
import { LIVE_EVENT_TYPES } from './events.js';

export const SOUND_SOURCES = ['myinstants'] as const;
export const SoundSourceSchema = z.enum(SOUND_SOURCES);
export type SoundSource = z.infer<typeof SoundSourceSchema>;

/** Hosts whose audio the browser may play directly. Anything else is rejected at the server. */
const ALLOWED_SOUND_HOSTS: Readonly<Record<SoundSource, readonly string[]>> = {
  myinstants: ['myinstants.com'],
};

/** True for an https URL on a known sound host (or a subdomain of it). */
export function isAllowedSoundUrl(value: string, source: SoundSource = 'myinstants'): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_SOUND_HOSTS[source].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

const soundUrl = z
  .string()
  .max(2000)
  .refine((v) => isAllowedSoundUrl(v), 'La URL del sonido no es de una fuente permitida');

/** Provider-neutral sound, as the dashboard sees it. */
export const SoundSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  pageUrl: soundUrl,
  audioUrl: soundUrl,
  duration: z.number().nonnegative().optional(),
  source: SoundSourceSchema,
});
export type Sound = z.infer<typeof SoundSchema>;

export const SoundSearchResultSchema = z.object({
  query: z.string(),
  page: z.number().int().positive(),
  hasNext: z.boolean(),
  results: z.array(SoundSchema),
});
export type SoundSearchResult = z.infer<typeof SoundSearchResultSchema>;

export const SOUND_QUERY_MAX = 100;
export const SOUND_PAGE_MAX = 50;

// ---------- Triggers ----------

/** A sound bound to a live event type. Only metadata and the remote URL are stored. */
export const TriggerDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  event: z.enum(LIVE_EVENT_TYPES),
  soundId: z.string().min(1).max(200),
  soundTitle: z.string().min(1).max(200),
  soundUrl,
  soundPageUrl: soundUrl,
  source: SoundSourceSchema.default('myinstants'),
  volume: z.number().min(0).max(1).default(0.8),
  enabled: z.boolean().default(true),
});
export type TriggerDefinition = z.infer<typeof TriggerDefinitionSchema>;
export type TriggerDefinitionInput = z.input<typeof TriggerDefinitionSchema>;

export const TriggerSchema = TriggerDefinitionSchema.extend({
  id: z.number().int().positive(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Trigger = z.infer<typeof TriggerSchema>;

export const TriggerExecuteResultSchema = z.object({
  /** queued: sent to the audio screen; disabled/invalid: nothing was sent. */
  status: z.enum(['queued', 'disabled', 'invalid']),
});
export type TriggerExecuteResult = z.infer<typeof TriggerExecuteResultSchema>;
