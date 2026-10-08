import type { EventStore } from '../../src/application/ports/event-store.js';
import { metricDeltas, scopeKeysFor } from '../../src/domain/projections/scopes.js';
import {
  RuleSchema,
  type CommentEvent,
  type LiveEvent,
  type GiftEvent,
  type LikeEvent,
  type RawGift,
  type RawLike,
  type Rule,
  type RuleDefinitionInput,
  type ViewerRef,
} from '@tiklive/contracts';

export function aViewer(overrides: Partial<ViewerRef> = {}): ViewerRef {
  const id = overrides.tiktokUserId ?? 'u1';
  return {
    tiktokUserId: id,
    uniqueId: `user_${id}`,
    nickname: `Nick ${id}`,
    isFollower: false,
    isSubscriber: false,
    isModerator: false,
    ...overrides,
  };
}

export function aRawGift(overrides: Partial<RawGift> = {}): RawGift {
  return {
    kind: 'gift',
    occurredAt: 1_000,
    viewer: aViewer(),
    giftId: 5655,
    giftName: 'Rose',
    diamondValue: 1,
    quantity: 1,
    streakable: true,
    streakEnded: false,
    ...overrides,
  };
}

export function aRawLike(overrides: Partial<RawLike> = {}): RawLike {
  return { kind: 'like', occurredAt: 1_000, viewer: aViewer(), likeCount: 5, ...overrides };
}

const base = { id: 'evt-1', sessionId: 1, occurredAt: 1_000 };

export function aGiftEvent(overrides: Partial<GiftEvent> = {}): GiftEvent {
  return {
    ...base,
    type: 'gift',
    viewer: aViewer(),
    giftId: 5655,
    giftName: 'Rose',
    diamondValue: 1,
    quantity: 1,
    isStreakFinal: true,
    ...overrides,
  };
}

export function aCommentEvent(overrides: Partial<CommentEvent> = {}): CommentEvent {
  return { ...base, type: 'comment', viewer: aViewer(), text: 'hola', ...overrides };
}

export function aLikeEvent(overrides: Partial<LikeEvent> = {}): LikeEvent {
  return { ...base, type: 'like', viewer: aViewer(), likeDelta: 10, totalLikes: 10, ...overrides };
}

let nextRuleId = 1;

export function aRule(input: Partial<RuleDefinitionInput> & { id?: number } = {}): Rule {
  const { id, ...definition } = input;
  return RuleSchema.parse({
    id: id ?? nextRuleId++,
    version: 1,
    name: 'test rule',
    trigger: 'gift',
    actions: [{ type: 'showAlert', text: '{nickname} envió {quantity} {giftName}' }],
    ...definition,
  });
}

/** Saves an event with the projection writes the ingest use case would compute. */
export function save(store: EventStore, event: LiveEvent): Promise<boolean> {
  return store.save(event, { scopeKeys: scopeKeysFor(event), deltas: metricDeltas(event) });
}
