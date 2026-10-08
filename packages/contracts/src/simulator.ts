import { z } from 'zod';
import type { ViewerRef } from './events.js';
import type { RawLiveEvent } from './raw-events.js';

/** Shorthand accepted by POST /simulator/emit and the CLI; expanded to a RawLiveEvent. */
export const SimulatorTemplateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('gift'),
    user: z.string().optional(),
    giftName: z.string().default('Rose'),
    giftId: z.number().int().default(5655),
    diamonds: z.number().int().nonnegative().default(1),
    quantity: z.number().int().positive().default(1),
    /** true: emits a streak of `quantity` partial messages, like TikTok does. */
    streak: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('comment'),
    user: z.string().optional(),
    text: z.string().default('hola!'),
  }),
  z.object({
    kind: z.literal('like'),
    user: z.string().optional(),
    count: z.number().int().positive().default(15),
  }),
  z.object({ kind: z.enum(['follow', 'join', 'share']), user: z.string().optional() }),
  z.object({ kind: z.literal('viewerCount'), viewers: z.number().int().nonnegative().default(42) }),
  z.object({ kind: z.literal('streamEnd') }),
]);
export type SimulatorTemplate = z.infer<typeof SimulatorTemplateSchema>;
export type SimulatorTemplateInput = z.input<typeof SimulatorTemplateSchema>;

export function simulatedViewer(user = 'tester'): ViewerRef {
  return {
    tiktokUserId: `sim-${user}`,
    uniqueId: user,
    nickname: user,
    isFollower: true,
    isSubscriber: false,
    isModerator: false,
  };
}

/** Expands a template into the raw messages TikTok would send (a streak is N messages). */
export function expandSimulatorTemplate(
  t: SimulatorTemplate,
  now: number,
  nextMsgId: () => string,
): RawLiveEvent[] {
  const base = { occurredAt: now, msgId: nextMsgId() };
  switch (t.kind) {
    case 'gift':
      return expandGift(t, now, nextMsgId);
    case 'comment':
      return [{ ...base, kind: 'comment', viewer: simulatedViewer(t.user), text: t.text }];
    case 'like':
      return [{ ...base, kind: 'like', viewer: simulatedViewer(t.user), likeCount: t.count }];
    case 'viewerCount':
      return [{ occurredAt: now, kind: 'viewerCount', viewerCount: t.viewers }];
    case 'streamEnd':
      return [{ occurredAt: now, kind: 'streamEnd' }];
    default:
      return [{ ...base, kind: t.kind, viewer: simulatedViewer(t.user) }];
  }
}

function expandGift(
  t: Extract<SimulatorTemplate, { kind: 'gift' }>,
  now: number,
  nextMsgId: () => string,
): RawLiveEvent[] {
  const gift = (quantity: number, streakEnded: boolean): RawLiveEvent => ({
    kind: 'gift',
    occurredAt: now,
    msgId: nextMsgId(),
    viewer: simulatedViewer(t.user),
    giftId: t.giftId,
    giftName: t.giftName,
    diamondValue: t.diamonds,
    quantity,
    streakable: t.streak,
    streakEnded,
  });
  if (!t.streak) return [gift(t.quantity, true)];
  return Array.from({ length: t.quantity }, (_, i) => gift(i + 1, i + 1 === t.quantity));
}
