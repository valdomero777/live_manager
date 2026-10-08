import { describe, expect, it } from 'vitest';
import { parseGiftList } from './tiktok-gift-catalog.js';

const gift = (id: number, name: string, diamond_count: number, url?: string) => ({
  id,
  name,
  diamond_count,
  image: url ? { url_list: [url, 'https://mirror'] } : null,
  combo: true,
});

describe('parseGiftList', () => {
  it('keeps one entry per id, cheapest first, with the first image url', () => {
    const payload = {
      data: {
        gifts: [
          gift(9427, 'Pegasus', 42999, 'https://p16/pegasus.webp'),
          gift(5655, 'Rose', 1, 'https://p16/rose.webp'),
          gift(9427, 'Pegasus', 42999),
          gift(1, '  ', 5),
          gift(7934, 'Heart Me', 1),
        ],
      },
    };
    expect(parseGiftList(payload)).toEqual([
      { id: 7934, name: 'Heart Me', diamonds: 1 },
      { id: 5655, name: 'Rose', diamonds: 1, imageUrl: 'https://p16/rose.webp' },
      { id: 9427, name: 'Pegasus', diamonds: 42999, imageUrl: 'https://p16/pegasus.webp' },
    ]);
  });

  it('rejects an unexpected payload', () => {
    expect(() => parseGiftList({ status_code: 1 })).toThrow();
  });
});
