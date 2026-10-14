import { z } from 'zod';

/** Overlays that can be saved as a template (the audio tab is not an overlay). */
export const OVERLAY_TEMPLATE_TYPES = [
  'leaderboard',
  'goal',
  'stats',
  'rotator',
  'alerts',
] as const;
export const OverlayTemplateTypeSchema = z.enum(OVERLAY_TEMPLATE_TYPES);
export type OverlayTemplateType = z.infer<typeof OverlayTemplateTypeSchema>;

export const MAX_OVERLAY_TEMPLATES = 50;
const MAX_TEMPLATE_PARAMS = 20;

/** What the panel sends: a named overlay URL configuration (type + query parameters). */
export const OverlayTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: OverlayTemplateTypeSchema,
  params: z
    .record(z.string().regex(/^[a-zA-Z]{1,32}$/), z.string().max(200))
    .refine((p) => Object.keys(p).length <= MAX_TEMPLATE_PARAMS, 'too many parameters')
    .default({}),
  /** Shown live on the panel's dashboard. */
  pinned: z.boolean().default(false),
});
export type OverlayTemplateInput = z.input<typeof OverlayTemplateInputSchema>;

export const OverlayTemplateSchema = OverlayTemplateInputSchema.extend({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  updatedAt: z.number().int(),
});
export type OverlayTemplate = z.infer<typeof OverlayTemplateSchema>;
