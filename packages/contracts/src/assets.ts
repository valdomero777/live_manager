import { z } from 'zod';

export const ASSET_KINDS = ['audio', 'image', 'video'] as const;
export const AssetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/** Upload limits per kind (spec 12): small files keep the stream PC light. */
export const ASSET_MAX_BYTES: Readonly<Record<AssetKind, number>> = {
  audio: 2 * 1024 * 1024,
  image: 5 * 1024 * 1024,
  video: 5 * 1024 * 1024,
};

export const AssetSchema = z.object({
  id: z.number().int().positive(),
  kind: AssetKindSchema,
  /** Public URL under /media/ (content-hashed file name). */
  url: z.string(),
  originalName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.number().int(),
});
export type Asset = z.infer<typeof AssetSchema>;
