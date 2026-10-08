import type { GiftInfo } from '@tiklive/contracts';

/** Where the list of existing TikTok gifts comes from (the TikTok adapter in production). */
export interface GiftCatalogSource {
  fetchGifts(): Promise<GiftInfo[]>;
}
