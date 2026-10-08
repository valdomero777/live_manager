import { z } from 'zod';

export const ViewerRefSchema = z.object({
  tiktokUserId: z.string().min(1),
  uniqueId: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().optional(),
  isFollower: z.boolean(),
  isSubscriber: z.boolean(),
  isModerator: z.boolean(),
});
export type ViewerRef = z.infer<typeof ViewerRefSchema>;

const baseEvent = {
  id: z.string().min(1),
  sessionId: z.number().int().nonnegative(),
  occurredAt: z.number().int().nonnegative(),
  dedupeKey: z.string().optional(),
};

export const CommentEventSchema = z.object({
  ...baseEvent,
  type: z.literal('comment'),
  viewer: ViewerRefSchema,
  text: z.string(),
});

export const GiftEventSchema = z.object({
  ...baseEvent,
  type: z.literal('gift'),
  viewer: ViewerRefSchema,
  giftId: z.number().int(),
  giftName: z.string(),
  giftImageUrl: z.string().optional(),
  diamondValue: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  isStreakFinal: z.boolean(),
});

export const LikeEventSchema = z.object({
  ...baseEvent,
  type: z.literal('like'),
  viewer: ViewerRefSchema,
  likeDelta: z.number().int().nonnegative(),
  totalLikes: z.number().int().nonnegative(),
});

export const FollowEventSchema = z.object({
  ...baseEvent,
  type: z.literal('follow'),
  viewer: ViewerRefSchema,
});

export const JoinEventSchema = z.object({
  ...baseEvent,
  type: z.literal('join'),
  viewer: ViewerRefSchema,
});

export const ShareEventSchema = z.object({
  ...baseEvent,
  type: z.literal('share'),
  viewer: ViewerRefSchema,
});

export const ViewerCountEventSchema = z.object({
  ...baseEvent,
  type: z.literal('viewerCount'),
  viewerCount: z.number().int().nonnegative(),
});

export const StreamEndEventSchema = z.object({
  ...baseEvent,
  type: z.literal('streamEnd'),
});

export const LiveEventSchema = z.discriminatedUnion('type', [
  CommentEventSchema,
  GiftEventSchema,
  LikeEventSchema,
  FollowEventSchema,
  JoinEventSchema,
  ShareEventSchema,
  ViewerCountEventSchema,
  StreamEndEventSchema,
]);

export type CommentEvent = z.infer<typeof CommentEventSchema>;
export type GiftEvent = z.infer<typeof GiftEventSchema>;
export type LikeEvent = z.infer<typeof LikeEventSchema>;
export type FollowEvent = z.infer<typeof FollowEventSchema>;
export type JoinEvent = z.infer<typeof JoinEventSchema>;
export type ShareEvent = z.infer<typeof ShareEventSchema>;
export type ViewerCountEvent = z.infer<typeof ViewerCountEventSchema>;
export type StreamEndEvent = z.infer<typeof StreamEndEventSchema>;
export type LiveEvent = z.infer<typeof LiveEventSchema>;
export type LiveEventType = LiveEvent['type'];
export type ViewerEvent = Extract<LiveEvent, { viewer: ViewerRef }>;

export const LIVE_EVENT_TYPES = [
  'comment',
  'gift',
  'like',
  'follow',
  'join',
  'share',
  'viewerCount',
  'streamEnd',
] as const satisfies readonly LiveEventType[];

export function hasViewer(event: LiveEvent): event is ViewerEvent {
  return 'viewer' in event;
}
