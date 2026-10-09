import type { LeaderboardRow, ScreenServerMessage } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { aCommentEvent, aGiftEvent } from '../../../test/support/builders.js';
import { FakeScheduler } from '../../../test/support/fakes.js';
import { StatsProjection } from '../../domain/projections/stats-projection.js';
import type { ChannelGateway } from '../ports/channel-gateway.js';
import { silentLogger } from '../ports/logger.js';
import type { GoalService } from './goal-service.js';
import type { LeaderboardService } from './leaderboard-service.js';
import { SNAPSHOT_DEBOUNCE_MS, SnapshotPublisher } from './snapshot-publisher.js';

function setup(subscribed: string[]) {
  const scheduler = new FakeScheduler();
  const published: { channel: string; message: ScreenServerMessage }[] = [];
  const gateway: ChannelGateway = {
    subscribe: () => () => undefined,
    publish: (channel, message) => published.push({ channel, message }),
    hasSubscribers: (channel) => subscribed.includes(channel),
  };
  const row: LeaderboardRow = { rank: 1, viewerId: 1, uniqueId: 'ana', nickname: 'Ana', value: 5 };
  let topCalls = 0;
  const invalidated: string[][] = [];
  const leaderboards = {
    top: async () => {
      topCalls++;
      return [row];
    },
    invalidate: (m: string[]) => invalidated.push(m),
    invalidateAll: () => undefined,
  } as unknown as LeaderboardService;
  const goals = {
    onProgress: () => undefined,
    evaluate: async () => [7],
    list: () => [{ id: 7 }],
    progress: async (id: number) => ({
      goalId: id,
      name: 'g',
      metric: 'diamonds',
      current: 5,
      target: 10,
      ratio: 0.5,
      cycle: 1,
      reached: false,
    }),
  } as unknown as GoalService;
  const publisher = new SnapshotPublisher({
    gateway,
    leaderboards,
    goals,
    stats: new StatsProjection(),
    scheduler,
    clock: scheduler.clock,
    logger: silentLogger,
  });
  return { scheduler, published, publisher, invalidated, topCalls: () => topCalls };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('SnapshotPublisher', () => {
  it('coalesces a burst of gifts into one snapshot per channel after 250 ms', async () => {
    const t = setup(['leaderboard:diamonds:session', 'goal:7', 'stats']);
    for (let i = 0; i < 10; i++) await t.publisher.handle(aGiftEvent());
    expect(t.published).toEqual([]);

    t.scheduler.advance(SNAPSHOT_DEBOUNCE_MS);
    await settle();
    expect(t.published.map((p) => p.channel).sort()).toEqual([
      'goal:7',
      'leaderboard:diamonds:session',
      'stats',
    ]);
    expect(t.invalidated[0]).toEqual(['diamonds', 'gift_count']);
  });

  it('skips channels nobody listens to', async () => {
    const t = setup([]);
    await t.publisher.handle(aGiftEvent());
    t.scheduler.advance(SNAPSHOT_DEBOUNCE_MS);
    await settle();
    expect(t.published).toEqual([]);
    expect(t.topCalls()).toBe(0);
  });

  it('increments seq per channel so overlays can drop stale snapshots', async () => {
    const t = setup(['leaderboard:diamonds:session']);
    for (let i = 0; i < 2; i++) {
      await t.publisher.handle(aGiftEvent());
      t.scheduler.advance(SNAPSHOT_DEBOUNCE_MS);
      await settle();
    }
    const seqs = t.published.map((p) => (p.message.payload as { seq: number }).seq);
    expect(seqs).toEqual([1, 2]);
  });

  it('events without metric changes only refresh stats when they change them', async () => {
    const t = setup(['stats', 'leaderboard:diamonds:session']);
    await t.publisher.handle(aCommentEvent()); // first event of a session: stats reset
    t.scheduler.advance(SNAPSHOT_DEBOUNCE_MS);
    await settle();
    expect(t.published.map((p) => p.channel)).toEqual(['stats']);

    await t.publisher.handle(aCommentEvent({ id: 'evt-2' }));
    t.scheduler.advance(SNAPSHOT_DEBOUNCE_MS);
    await settle();
    expect(t.published).toHaveLength(1);
  });

  it('sends a full snapshot for each requested channel on hello', async () => {
    const t = setup([]);
    const sent: string[] = [];
    await t.publisher.sendInitial({ send: (d) => sent.push(d), close: () => undefined }, [
      'leaderboard:likes:week',
      'goal:7',
      'stats',
      'leaderboard:bogus:week',
    ]);
    expect(sent.map((d) => (JSON.parse(d) as { type: string }).type)).toEqual([
      'leaderboard.snapshot',
      'goal.progress',
      'stats.snapshot',
    ]);
  });
});
