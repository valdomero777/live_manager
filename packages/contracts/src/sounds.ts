import { z } from 'zod';
import { LIVE_EVENT_TYPES } from './events.js';

export const SOUND_SOURCES = ['myinstants', 'freesound'] as const;
export const SoundSourceSchema = z.enum(SOUND_SOURCES);
export type SoundSource = z.infer<typeof SoundSourceSchema>;

/** Sources that can list their most downloaded sounds without a search term. */
export const POPULAR_SOUND_SOURCES: readonly SoundSource[] = ['freesound'];

/** Name shown in the dashboard for each source. */
export const SOUND_SOURCE_LABELS: Readonly<Record<SoundSource, string>> = {
  myinstants: 'MyInstants',
  freesound: 'Freesound',
};

/** Hosts whose audio the browser may play directly. Anything else is rejected at the server. */
const ALLOWED_SOUND_HOSTS: Readonly<Record<SoundSource, readonly string[]>> = {
  myinstants: ['myinstants.com'],
  // Pages on freesound.org, MP3 previews on cdn.freesound.org.
  freesound: ['freesound.org'],
};

/**
 * True for an https URL on the hosts of `source` (or a subdomain of them). Without a source, any
 * known sound host is accepted.
 */
export function isAllowedSoundUrl(value: string, source?: SoundSource): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const hosts = source ? ALLOWED_SOUND_HOSTS[source] : Object.values(ALLOWED_SOUND_HOSTS).flat();
    return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

const soundUrl = z
  .string()
  .max(2000)
  .refine((v) => isAllowedSoundUrl(v), 'La URL del sonido no es de una fuente permitida');

/** Licences accepted from Freesound: free to use in a LIVE, CC BY with credit to the author. */
export const SOUND_LICENSES = ['cc0', 'cc-by'] as const;
export type SoundLicense = (typeof SOUND_LICENSES)[number];

/** Provider-neutral sound, as the dashboard sees it. */
export const SoundSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  pageUrl: soundUrl,
  audioUrl: soundUrl,
  duration: z.number().nonnegative().optional(),
  source: SoundSourceSchema,
  /** Uploader, when the source credits one (Freesound). */
  author: z.string().min(1).max(200).optional(),
  license: z.enum(SOUND_LICENSES).optional(),
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

/** What the API accepts: both URLs must belong to the trigger's source, not just any source. */
export const TriggerDefinitionRequestSchema = TriggerDefinitionSchema.superRefine((t, ctx) => {
  for (const key of ['soundUrl', 'soundPageUrl'] as const) {
    if (!isAllowedSoundUrl(t[key], t.source))
      ctx.addIssue({ code: 'custom', path: [key], message: 'La URL no es de la fuente elegida' });
  }
});

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
