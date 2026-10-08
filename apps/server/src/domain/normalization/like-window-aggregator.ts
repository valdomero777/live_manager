import type { RawLike, ViewerRef } from '@tiklive/contracts';
import type { Clock } from '../shared/time.js';

export const LIKE_WINDOW_MS = 1_000;

export interface AggregatedLike {
  readonly sessionId: number;
  readonly viewer: ViewerRef;
  readonly likeDelta: number;
  readonly totalLikes: number;
  readonly occurredAt: number;
}

interface OpenWindow {
  readonly sessionId: number;
  viewer: ViewerRef;
  likeDelta: number;
  occurredAt: number;
  readonly openedAt: number;
}

/**
 * Groups like packets per viewer into windows of `windowMs` so the rule engine is not
 * flooded, and keeps the room total monotonic (a total that goes backwards is ignored).
 */
export class LikeWindowAggregator {
  private readonly windows = new Map<string, OpenWindow>();
  private readonly roomTotals = new Map<number, number>();

  constructor(
    private readonly clock: Clock,
    private readonly windowMs = LIKE_WINDOW_MS,
  ) {}

  ingest(sessionId: number, like: RawLike): void {
    this.trackTotal(sessionId, like);
    const key = `${sessionId}:${like.viewer.tiktokUserId}`;
    const window = this.windows.get(key);
    if (window) {
      window.likeDelta += like.likeCount;
      window.viewer = like.viewer;
      window.occurredAt = like.occurredAt;
      return;
    }
    this.windows.set(key, {
      sessionId,
      viewer: like.viewer,
      likeDelta: like.likeCount,
      occurredAt: like.occurredAt,
      openedAt: this.clock.now(),
    });
  }

  /** Emits windows older than `windowMs`. */
  flushDue(): AggregatedLike[] {
    const now = this.clock.now();
    return this.flushWhere((w) => now - w.openedAt >= this.windowMs);
  }

  flushAll(): AggregatedLike[] {
    return this.flushWhere(() => true);
  }

  totalFor(sessionId: number): number {
    return this.roomTotals.get(sessionId) ?? 0;
  }

  private trackTotal(sessionId: number, like: RawLike): void {
    const previous = this.roomTotals.get(sessionId) ?? 0;
    const reported = like.totalLikes ?? previous + like.likeCount;
    this.roomTotals.set(sessionId, Math.max(previous, reported));
  }

  private flushWhere(predicate: (w: OpenWindow) => boolean): AggregatedLike[] {
    const out: AggregatedLike[] = [];
    for (const [key, w] of this.windows) {
      if (!predicate(w)) continue;
      this.windows.delete(key);
      if (w.likeDelta <= 0) continue;
      out.push({
        sessionId: w.sessionId,
        viewer: w.viewer,
        likeDelta: w.likeDelta,
        totalLikes: this.totalFor(w.sessionId),
        occurredAt: w.occurredAt,
      });
    }
    return out;
  }
}
