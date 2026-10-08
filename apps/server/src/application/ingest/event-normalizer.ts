import { LiveEventSchema, type LiveEvent, type RawLiveEvent } from '@tiklive/contracts';
import {
  GiftStreakAggregator,
  type ConsolidatedGift,
} from '../../domain/normalization/gift-streak-aggregator.js';
import {
  LikeWindowAggregator,
  type AggregatedLike,
} from '../../domain/normalization/like-window-aggregator.js';
import { LruSet } from '../../domain/shared/lru-set.js';
import type { Clock } from '../../domain/shared/time.js';
import type { IdGenerator } from '../ports/scheduler.js';

export const DEDUPE_CAPACITY = 5_000;

export type DropReason = 'duplicate' | 'invalid';

interface NormalizerDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly onDrop?: (reason: DropReason, raw: RawLiveEvent) => void;
}

/**
 * Turns RawLiveEvent into validated LiveEvent: msgId dedupe, gift streak consolidation,
 * like windows. Gift and like events are buffered and come out of push() or flush().
 */
export class EventNormalizer {
  private readonly streaks: GiftStreakAggregator;
  private readonly likes: LikeWindowAggregator;
  private readonly seen = new LruSet(DEDUPE_CAPACITY);

  constructor(private readonly deps: NormalizerDeps) {
    this.streaks = new GiftStreakAggregator(deps.clock);
    this.likes = new LikeWindowAggregator(deps.clock);
  }

  push(sessionId: number, raw: RawLiveEvent): LiveEvent[] {
    if (raw.msgId !== undefined && !this.seen.add(raw.msgId)) {
      this.deps.onDrop?.('duplicate', raw);
      return [];
    }
    switch (raw.kind) {
      case 'gift':
        return this.fromGifts(this.streaks.ingest(sessionId, raw));
      case 'like':
        this.likes.ingest(sessionId, raw);
        return [];
      case 'streamEnd':
        return [
          ...this.flushAll(),
          ...this.validate(raw, { type: 'streamEnd', sessionId, occurredAt: raw.occurredAt }),
        ];
      default:
        return this.validate(raw, { ...this.mapSimple(raw), sessionId });
    }
  }

  /** Emits idle streaks and due like windows. Call periodically. */
  flush(): LiveEvent[] {
    return [...this.fromGifts(this.streaks.flushIdle()), ...this.fromLikes(this.likes.flushDue())];
  }

  flushAll(): LiveEvent[] {
    return [...this.fromGifts(this.streaks.flushAll()), ...this.fromLikes(this.likes.flushAll())];
  }

  roomLikes(sessionId: number): number {
    return this.likes.totalFor(sessionId);
  }

  private mapSimple(raw: Exclude<RawLiveEvent, { kind: 'gift' | 'like' | 'streamEnd' }>) {
    const common = { occurredAt: raw.occurredAt };
    switch (raw.kind) {
      case 'comment':
        return { ...common, type: 'comment' as const, viewer: raw.viewer, text: raw.text };
      case 'viewerCount':
        return { ...common, type: 'viewerCount' as const, viewerCount: raw.viewerCount };
      default:
        return { ...common, type: raw.kind, viewer: raw.viewer };
    }
  }

  private fromGifts(gifts: readonly ConsolidatedGift[]): LiveEvent[] {
    return gifts.flatMap(({ sessionId, gift }) =>
      this.validate(gift, {
        type: 'gift',
        sessionId,
        occurredAt: gift.occurredAt,
        viewer: gift.viewer,
        giftId: gift.giftId,
        giftName: gift.giftName,
        giftImageUrl: gift.giftImageUrl,
        diamondValue: gift.diamondValue,
        quantity: gift.quantity,
        isStreakFinal: true,
      }),
    );
  }

  private fromLikes(likes: readonly AggregatedLike[]): LiveEvent[] {
    return likes.flatMap((like) => this.validate(undefined, { type: 'like', ...like }));
  }

  /** Adds id/dedupeKey and validates with Zod; invalid events are dropped and reported. */
  private validate(raw: RawLiveEvent | undefined, candidate: object): LiveEvent[] {
    const dedupeKey = raw?.msgId;
    const result = LiveEventSchema.safeParse({
      ...candidate,
      id: this.deps.ids.next(),
      ...(dedupeKey === undefined ? {} : { dedupeKey }),
    });
    if (result.success) return [result.data];
    if (raw) this.deps.onDrop?.('invalid', raw);
    return [];
  }
}
