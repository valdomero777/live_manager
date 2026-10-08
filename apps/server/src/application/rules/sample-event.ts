import {
  LiveEventSchema,
  simulatedViewer,
  type LiveEvent,
  type LiveEventType,
  type RuleTestRequest,
} from '@tiklive/contracts';

const DEFAULTS = {
  user: 'prueba',
  giftName: 'Rose',
  giftId: 5655,
  diamonds: 1,
  quantity: 1,
  text: 'hola!',
  likes: 100,
};

/** A realistic LiveEvent of the given type for the rule test, with the caller's overrides. */
export function sampleEvent(
  type: LiveEventType,
  overrides: RuleTestRequest,
  base: { id: string; sessionId: number; occurredAt: number },
): LiveEvent {
  const o = { ...DEFAULTS, ...overrides };
  const viewer = simulatedViewer(o.user);
  const candidate = ((): object => {
    switch (type) {
      case 'gift':
        return {
          type,
          viewer,
          giftId: o.giftId,
          giftName: o.giftName,
          diamondValue: o.diamonds,
          quantity: o.quantity,
          isStreakFinal: true,
        };
      case 'comment':
        return { type, viewer, text: o.text };
      case 'like':
        return { type, viewer, likeDelta: o.likes, totalLikes: o.likes };
      case 'viewerCount':
        return { type, viewerCount: 42 };
      case 'streamEnd':
        return { type };
      default:
        return { type, viewer };
    }
  })();
  return LiveEventSchema.parse({ ...base, ...candidate });
}
