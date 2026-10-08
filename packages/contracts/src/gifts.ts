import { z } from 'zod';

/** One gift of TikTok's catalog; `diamonds` is its price in coins (1 coin = 1 diamond). */
export const GiftInfoSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  diamonds: z.number().int().nonnegative(),
  imageUrl: z.string().optional(),
});
export type GiftInfo = z.infer<typeof GiftInfoSchema>;

export const GiftCatalogSchema = z.object({
  /** Sorted by price, cheapest first. */
  gifts: z.array(GiftInfoSchema),
  /** When the list was downloaded from TikTok (epoch ms). */
  fetchedAt: z.number().int(),
  /** True when TikTok could not be reached and an older copy is served. */
  stale: z.boolean(),
});
export type GiftCatalog = z.infer<typeof GiftCatalogSchema>;
