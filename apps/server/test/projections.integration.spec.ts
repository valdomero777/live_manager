import {
  GoalDefinitionSchema,
  type GoalDefinitionInput,
  type LiveEvent,
  type Metric,
} from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import type { PlannedAction } from '../src/domain/rules/actions.js';
import { IngestLiveEvent } from '../src/application/ingest/ingest-live-event.js';
import { silentLogger } from '../src/application/ports/logger.js';
import { GoalService } from '../src/application/projections/goal-service.js';
import { LeaderboardService } from '../src/application/projections/leaderboard-service.js';
import { metricDeltas } from '../src/domain/projections/scopes.js';
import { createDefaultActionRegistry } from '../src/domain/rules/actions.js';
import { FakeClock } from '../src/domain/shared/time.js';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { runMigrations } from '../src/infrastructure/sqlite/migrator.js';
import { SqliteEventStore } from '../src/infrastructure/sqlite/sqlite-event-store.js';
import { SqliteGoalRepository } from '../src/infrastructure/sqlite/sqlite-goal-repository.js';
import { SqliteLeaderboardRepository } from '../src/infrastructure/sqlite/sqlite-leaderboard-repository.js';
import { SqliteSessionRepository } from '../src/infrastructure/sqlite/sqlite-session-repository.js';
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/sqlite-settings-repository.js';
import { aGiftEvent, aLikeEvent, aViewer } from './support/builders.js';
import { RecordingNotifier, SequentialIds } from './support/fakes.js';

const NOW = Date.parse('2026-10-06T20:00:00Z');

async function setup() {
  const handle = openDatabase(':memory:');
  runMigrations(handle.sqlite);
  const clock = new FakeClock(NOW);
  const sessions = new SqliteSessionRepository(handle.db);
  let sessionId = (await sessions.start('alan', NOW)).id;
  const repo = new SqliteLeaderboardRepository(handle.db);
  const leaderboards = new LeaderboardService({
    repo,
    settings: new SqliteSettingsRepository(handle.db),
    currentSessionId: () => sessionId,
    clock,
  });
  const planned: PlannedAction[] = [];
  const goalRepo = new SqliteGoalRepository(handle.db);
  const makeGoals = () =>
    new GoalService({
      repo: goalRepo,
      totals: repo,
      currentSessionId: () => sessionId,
      actions: createDefaultActionRegistry(),
      assets: { urlFor: () => '/media/x.wav' },
      sink: { enqueue: (a) => planned.push(a) },
      ids: new SequentialIds(),
      clock,
      logger: silentLogger,
    });
  let goals = makeGoals();
  const ingest = new IngestLiveEvent({
    events: new SqliteEventStore(handle.sqlite),
    consumers: [
      {
        handle: async (e: LiveEvent) => {
          const metrics: Metric[] = metricDeltas(e).map((d) => d.metric);
          leaderboards.invalidate(metrics);
          await goals.evaluate(e, metrics);
        },
      },
    ],
    notifier: new RecordingNotifier(),
    logger: silentLogger,
  });
  let n = 0;
  const ingestEvent = (e: Partial<LiveEvent> & Pick<LiveEvent, 'type'>) =>
    ingest.execute({ ...e, id: `e${++n}`, sessionId, occurredAt: NOW } as LiveEvent);
  return {
    handle,
    leaderboards,
    planned,
    get goals() {
      return goals;
    },
    restartGoals: async () => {
      goals = makeGoals();
      await goals.reload();
    },
    newSession: async () => {
      sessionId = (await sessions.start('alan', NOW)).id;
    },
    gift: (user: string, diamonds: number, quantity = 1) =>
      ingestEvent(
        aGiftEvent({
          viewer: aViewer({ tiktokUserId: user, uniqueId: user }),
          diamondValue: diamonds,
          quantity,
        }),
      ),
    like: (user: string, likeDelta: number) =>
      ingestEvent(
        aLikeEvent({ viewer: aViewer({ tiktokUserId: user, uniqueId: user }), likeDelta }),
      ),
    ingestRaw: (e: LiveEvent) => ingest.execute(e),
  };
}

describe('leaderboards', () => {
  it('reorders after a gift and breaks ties by first-seen viewer (RF-12)', async () => {
    const t = await setup();
    await t.gift('ana', 5);
    await t.gift('leo', 5);
    expect((await t.leaderboards.top('diamonds', 'session')).map((r) => r.uniqueId)).toEqual([
      'ana',
      'leo',
    ]);

    await t.gift('leo', 1, 3);
    const rows = await t.leaderboards.top('diamonds', 'session');
    expect(rows.map((r) => [r.rank, r.uniqueId, r.value])).toEqual([
      [1, 'leo', 8],
      [2, 'ana', 5],
    ]);
    expect((await t.leaderboards.top('gift_count', 'session'))[0]).toMatchObject({
      uniqueId: 'leo',
      value: 4,
    });
  });

  it('sums likes exactly as received (RF-13)', async () => {
    const t = await setup();
    for (const delta of [15, 3, 40]) await t.like('ana', delta);
    await t.like('leo', 7);
    const rows = await t.leaderboards.top('likes', 'session');
    expect(rows.map((r) => r.value)).toEqual([58, 7]);
  });

  it('session reset keeps week and total (RF-14)', async () => {
    const t = await setup();
    await t.gift('ana', 10);
    // one viewer x (diamonds, gift_count)
    expect(await t.leaderboards.reset('session')).toBe(2);
    expect(await t.leaderboards.top('diamonds', 'session')).toEqual([]);
    expect((await t.leaderboards.top('diamonds', 'week'))[0]?.value).toBe(10);
    expect((await t.leaderboards.top('diamonds', 'total'))[0]?.value).toBe(10);
  });

  it('a new session starts an empty session ranking while totals accumulate', async () => {
    const t = await setup();
    await t.gift('ana', 10);
    await t.newSession();
    t.leaderboards.invalidateAll();
    await t.gift('ana', 1);
    expect((await t.leaderboards.top('diamonds', 'session'))[0]?.value).toBe(1);
    expect((await t.leaderboards.top('diamonds', 'total'))[0]?.value).toBe(11);
  });

  it('hides excluded viewers', async () => {
    const t = await setup();
    await t.gift('ana', 10);
    await t.gift('mod', 99);
    await t.leaderboards.updateSettings({ excludedUniqueIds: ['mod'] });
    expect((await t.leaderboards.top('diamonds', 'session')).map((r) => r.uniqueId)).toEqual([
      'ana',
    ]);
  });

  it('a duplicate event never doubles the totals', async () => {
    const t = await setup();
    const event = aGiftEvent({ id: 'x1', sessionId: 1, dedupeKey: 'm1', diamondValue: 10 });
    expect(await t.ingestRaw(event)).toBe(true);
    expect(await t.ingestRaw({ ...event, id: 'x2' })).toBe(false);
    t.leaderboards.invalidateAll();
    expect((await t.leaderboards.top('diamonds', 'total'))[0]?.value).toBe(10);
  });

  it('consistency: ranking sums equal the sum of logged events (spec 11)', async () => {
    const t = await setup();
    const users = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 60; i++) {
      const user = users[i % users.length]!;
      if (i % 3 === 0) await t.like(user, (i % 7) + 1);
      else await t.gift(user, (i % 5) + 1, (i % 4) + 1);
    }
    const rows = t.handle.sqlite
      .prepare("SELECT payload FROM live_event WHERE type IN ('gift', 'like')")
      .all() as { payload: string }[];
    const expected = { diamonds: 0, gift_count: 0, likes: 0 };
    for (const { payload } of rows) {
      for (const d of metricDeltas(JSON.parse(payload) as LiveEvent))
        expected[d.metric] += d.amount;
    }
    for (const metric of ['diamonds', 'gift_count', 'likes'] as const) {
      const sum = (
        t.handle.sqlite
          .prepare(
            "SELECT COALESCE(SUM(value), 0) AS s FROM leaderboard_total WHERE scope = 'total' AND metric = ?",
          )
          .get(metric) as { s: number }
      ).s;
      expect(sum).toBe(expected[metric]);
    }
  });

  it('load smoke: ingests 1000 events with correct totals', async () => {
    const t = await setup();
    const started = performance.now();
    for (let i = 0; i < 1000; i++) await t.gift(`u${i % 50}`, 1);
    const elapsed = performance.now() - started;
    const top = await t.leaderboards.top('diamonds', 'session', 1);
    expect(top[0]?.value).toBe(20);
    // Smoke bound only (CI machines and a busy dev box vary a lot); the release gate is
    // tools/load-test.ts, which reports real throughput against the 1000 events/s target.
    expect(elapsed).toBeLessThan(5_000);
  });
});

describe('goals', () => {
  const define = (input: GoalDefinitionInput) => GoalDefinitionSchema.parse(input);
  const celebrate = [{ type: 'showAlert' as const, text: 'Meta {goalName} #{cycle} ({current})' }];

  it('reaching a goal runs on_reach once, even after a restart (RF-15)', async () => {
    const t = await setup();
    const goal = await t.goals.create(
      define({ name: 'Rosas', metric: 'diamonds', target: 10, onReach: celebrate }),
    );
    await t.gift('ana', 6);
    expect(t.planned).toHaveLength(0);
    expect(await t.goals.progress(goal.id)).toMatchObject({
      current: 6,
      target: 10,
      ratio: 0.6,
      reached: false,
    });

    await t.gift('leo', 5);
    expect(t.planned.map((p) => [p.origin, p.command.payload])).toEqual([
      [{ kind: 'goal', id: goal.id }, expect.objectContaining({ text: 'Meta Rosas #1 (11)' })],
    ]);

    await t.restartGoals();
    await t.gift('leo', 5);
    expect(t.planned).toHaveLength(1);
    expect(await t.goals.progress(goal.id)).toMatchObject({ ratio: 1, reached: true });
  });

  it('manual progress counts toward the goal and celebrates once (updateGoal)', async () => {
    const t = await setup();
    const goal = await t.goals.create(
      define({ name: 'Rosas', metric: 'diamonds', target: 10, onReach: celebrate }),
    );
    const seen: number[] = [];
    t.goals.onProgress((id) => seen.push(id));

    await t.gift('ana', 4);
    expect(await t.goals.adjust(goal.id, 5, 'manual')).toBe(true);
    expect(t.planned).toHaveLength(0);
    expect(await t.goals.progress(goal.id)).toMatchObject({ current: 9, reached: false });

    await t.goals.adjust(goal.id, 2, 'manual');
    expect(t.planned).toHaveLength(1);
    await t.restartGoals();
    await t.goals.adjust(goal.id, 1, 'manual');
    expect(t.planned).toHaveLength(1);
    expect(seen).toEqual([goal.id, goal.id]);

    await t.goals.adjust(goal.id, -100, 'manual');
    expect(await t.goals.progress(goal.id)).toMatchObject({ current: 0 });
    expect(await t.goals.adjust(999, 1, 'manual')).toBe(false);
  });

  it('a repeating goal fires each cycle with a growing target', async () => {
    const t = await setup();
    const goal = await t.goals.create(
      define({ name: 'Likes', metric: 'likes', target: 100, repeatFactor: 2, onReach: celebrate }),
    );
    await t.like('ana', 120);
    await t.like('ana', 100);
    expect(t.planned).toHaveLength(2);
    expect(await t.goals.progress(goal.id)).toMatchObject({ cycle: 3, target: 400, current: 220 });
  });

  it('a session goal starts over in a new session', async () => {
    const t = await setup();
    await t.goals.create(define({ name: 'G', metric: 'gifts', target: 2, onReach: celebrate }));
    await t.gift('ana', 1, 2);
    await t.newSession();
    await t.gift('ana', 1, 2);
    expect(t.planned).toHaveLength(2);
  });

  it('inactive goals never fire', async () => {
    const t = await setup();
    await t.goals.create(
      define({ name: 'Off', metric: 'diamonds', target: 1, active: false, onReach: celebrate }),
    );
    await t.gift('ana', 5);
    expect(t.planned).toEqual([]);
  });
});
