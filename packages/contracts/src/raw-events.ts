import { z } from 'zod';
import { ViewerRefSchema } from './events.js';

/**
 * Library-neutral event produced by every LiveEventSource (real connector or simulator).
 * Only the TikTok adapter knows the library's message shapes; it translates them into this.
 * The normalizer turns RawLiveEvent into LiveEvent (dedupe, gift streaks, like deltas).
 */
const rawBase = {
  msgId: z.string().optional(),
  occurredAt: z.number().int().nonnegative(),
};

export const RawCommentSchema = z.object({
  ...rawBase,
  kind: z.literal('comment'),
  viewer: ViewerRefSchema,
  text: z.string(),
});

export const RawGiftSchema = z.object({
  ...rawBase,
  kind: z.literal('gift'),
  viewer: ViewerRefSchema,
  giftId: z.number().int(),
  giftName: z.string(),
  giftImageUrl: z.string().optional(),
  diamondValue: z.number().int().nonnegative(),
  /** Cumulative count of the streak so far (TikTok repeatCount). */
  quantity: z.number().int().positive(),
  streakable: z.boolean(),
  streakEnded: z.boolean(),
});

export const RawLikeSchema = z.object({
  ...rawBase,
  kind: z.literal('like'),
  viewer: ViewerRefSchema,
  likeCount: z.number().int().nonnegative(),
  /** Room total reported by TikTok, when available. */
  totalLikes: z.number().int().nonnegative().optional(),
});

export const RawSocialSchema = z.object({
  ...rawBase,
  kind: z.enum(['follow', 'join', 'share']),
  viewer: ViewerRefSchema,
});

export const RawViewerCountSchema = z.object({
  ...rawBase,
  kind: z.literal('viewerCount'),
  viewerCount: z.number().int().nonnegative(),
});

export const RawStreamEndSchema = z.object({
  ...rawBase,
  kind: z.literal('streamEnd'),
});

export const RawLiveEventSchema = z.discriminatedUnion('kind', [
  RawCommentSchema,
  RawGiftSchema,
  RawLikeSchema,
  RawSocialSchema,
  RawViewerCountSchema,
  RawStreamEndSchema,
]);

export type RawComment = z.infer<typeof RawCommentSchema>;
export type RawGift = z.infer<typeof RawGiftSchema>;
export type RawLike = z.infer<typeof RawLikeSchema>;
export type RawSocial = z.infer<typeof RawSocialSchema>;
export type RawViewerCount = z.infer<typeof RawViewerCountSchema>;
export type RawLiveEvent = z.infer<typeof RawLiveEventSchema>;
