import type { GiftInfo } from '@tiklive/contracts';
import { z } from 'zod';
import type { GiftCatalogSource } from '../../application/ports/gift-catalog-source.js';

/** Public webcast endpoint; it answers without signing when no room_id is given. */
const GIFT_LIST_URL =
  'https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_name=tiktok_web&device_platform=web_pc&app_language=es&browser_language=es-ES';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15_000;

const GiftListResponse = z.object({
  data: z.object({
    gifts: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        diamond_count: z.number(),
        image: z.object({ url_list: z.array(z.string()).optional() }).nullish(),
      }),
    ),
  }),
});

/** Turns TikTok's gift/list payload into the catalog: one entry per id, cheapest first. */
export function parseGiftList(payload: unknown): GiftInfo[] {
  const byId = new Map<number, GiftInfo>();
  for (const g of GiftListResponse.parse(payload).data.gifts) {
    const name = g.name.trim();
    if (!name || byId.has(g.id)) continue;
    const imageUrl = g.image?.url_list?.[0];
    byId.set(g.id, {
      id: g.id,
      name,
      diamonds: g.diamond_count,
      ...(imageUrl ? { imageUrl } : {}),
    });
  }
  return [...byId.values()].sort((a, b) => a.diamonds - b.diamonds || a.name.localeCompare(b.name));
}

export class TikTokGiftCatalog implements GiftCatalogSource {
  async fetchGifts(): Promise<GiftInfo[]> {
    const response = await fetch(GIFT_LIST_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`gift/list answered ${response.status}`);
    return parseGiftList(await response.json());
  }
}
