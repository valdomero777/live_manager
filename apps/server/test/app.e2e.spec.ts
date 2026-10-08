import {
  API_PREFIX,
  ScreenServerMessageSchema,
  type ScreenServerMessage,
  type Subscription,
} from '@tiklive/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { App } from '../src/main/composition-root.js';
import { startTestApp, TEST_OVERLAY_KEY as KEY, type TestApp } from './support/test-app.js';

/** Collects parsed screen messages and lets a test await the next one of a type. */
function collect(ws: WebSocket) {
  const messages: ScreenServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (raw: Buffer) => {
    messages.push(ScreenServerMessageSchema.parse(JSON.parse(raw.toString())));
    waiters.splice(0).forEach((w) => w());
  });
  async function next<T extends ScreenServerMessage['type']>(type: T, timeoutMs = 3_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = messages.find((m) => m.type === type);
      if (found) {
        messages.splice(messages.indexOf(found), 1);
        return found as Extract<ScreenServerMessage, { type: T }>;
      }
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${type}`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }
  return { next };
}

function hello(ws: WebSocket, screenId: string, subscriptions: Subscription[] = []): void {
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'client.hello',
      ts: Date.now(),
      payload: { screenId, clientVersion: 't', subscriptions },
    }),
  );
}

describe('app end to end (simulator -> rules -> queue -> overlay)', () => {
  let t: TestApp;
  let app: App;

  beforeEach(async () => {
    t = await startTestApp();
    app = t.app;
  });

  afterEach(() => t.stop());

  it('reports health with the simulated connector', async () => {
    const res = await t.api({ method: 'GET', url: `${API_PREFIX}/health` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok', version: 'test' });
  });

  it('rejects overlay sockets without the key', async () => {
    const ws = await app.http.injectWS('/ws/screen/alerts?key=wrong');
    const code = await new Promise<number>((resolve) => ws.on('close', (c: number) => resolve(c)));
    expect(code).toBe(1008);
  });

  it('validates rule input with problem+json', async () => {
    const res = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/rules`,
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('a rule created over HTTP fires on a simulated gift streak without restarting (RF-04, RF-05)', async () => {
    const ws = await app.http.injectWS(`/ws/screen/alerts?key=${KEY}`);
    const screen = collect(ws);
    hello(ws, 'alerts');
    await screen.next('config.changed');

    const created = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/rules`,
      payload: {
        name: 'Rosa grande',
        trigger: 'gift',
        conditions: [{ type: 'quantity', op: 'gte', value: 10 }],
        actions: [
          { type: 'showAlert', text: '{nickname} envió {quantity} {giftName}', durationMs: 1000 },
        ],
      },
    });
    expect(created.statusCode).toBe(201);

    const emitted = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/simulator/emit`,
      payload: { kind: 'gift', user: 'ana', quantity: 10, streak: true },
    });
    expect(emitted.json()).toEqual({ emitted: 10 });

    const alert = await screen.next('action.show_alert');
    expect(alert.payload.text).toBe('ana envió 10 Rose');

    ws.send(
      JSON.stringify({
        v: 1,
        type: 'action.done',
        ts: Date.now(),
        payload: { actionId: alert.payload.actionId, durationMs: 1000 },
      }),
    );
    ws.terminate();
  });

  it('streams leaderboard, goal and stats snapshots to a subscribed overlay (RF-12, RF-15, RF-16)', async () => {
    const goal = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/goals`,
      payload: { name: 'Rosas', metric: 'diamonds', target: 20 },
    });
    expect(goal.statusCode).toBe(201);
    const goalId = goal.json<{ id: number }>().id;

    const ws = await app.http.injectWS(`/ws/screen/rotator?key=${KEY}`);
    const screen = collect(ws);
    hello(ws, 'rotator', [
      { kind: 'leaderboard', metric: 'diamonds', scope: 'session' },
      { kind: 'goal', goalId },
      { kind: 'stats' },
    ]);
    const initial = await screen.next('leaderboard.snapshot');
    expect(initial.payload.rows).toEqual([]);
    await screen.next('goal.progress');
    await screen.next('stats.snapshot');

    const emit = (payload: object) =>
      t.api({ method: 'POST', url: `${API_PREFIX}/simulator/emit`, payload });
    await emit({ kind: 'gift', user: 'ana', diamonds: 5, quantity: 2 });
    await emit({ kind: 'gift', user: 'leo', diamonds: 1, quantity: 3 });

    const started = Date.now();
    let board = await screen.next('leaderboard.snapshot');
    while (board.payload.rows.length < 2) board = await screen.next('leaderboard.snapshot');
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(board.payload.rows.map((r) => [r.uniqueId, r.value])).toEqual([
      ['ana', 10],
      ['leo', 3],
    ]);
    expect(board.payload.seq).toBeGreaterThan(initial.payload.seq);
    const progress = await screen.next('goal.progress');
    expect(progress.payload).toMatchObject({ current: 13, target: 20 });
    const stats = await screen.next('stats.snapshot');
    expect(stats.payload).toMatchObject({ diamonds: 13 });

    const rest = await t.api({
      url: `${API_PREFIX}/leaderboards/diamonds?scope=total&limit=1`,
    });
    expect(rest.json()).toMatchObject({ rows: [{ uniqueId: 'ana', value: 10 }] });
    ws.terminate();
  });

  it('resets the session ranking but keeps totals, and requires confirm for total (RF-14)', async () => {
    await t.api({
      method: 'POST',
      url: `${API_PREFIX}/simulator/emit`,
      payload: { kind: 'gift', user: 'ana', diamonds: 7 },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reset = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/leaderboards/reset`,
      payload: { scope: 'session' },
    });
    expect(reset.json()).toMatchObject({ scope: 'session', removed: 2 });
    const session = await t.api({
      url: `${API_PREFIX}/leaderboards/diamonds?scope=session`,
    });
    const totals = await t.api({
      url: `${API_PREFIX}/leaderboards/diamonds?scope=total`,
    });
    expect(session.json()).toMatchObject({ rows: [] });
    expect(totals.json()).toMatchObject({ rows: [{ value: 7 }] });

    const unconfirmed = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/leaderboards/reset`,
      payload: { scope: 'total' },
    });
    expect(unconfirmed.statusCode).toBe(400);
  });

  it('serves rotator configs to overlays only with the key', async () => {
    const saved = await t.api({
      method: 'PUT',
      url: `${API_PREFIX}/rotators/main`,
      payload: { panels: [{ type: 'stats' }] },
    });
    expect(saved.statusCode).toBe(200);
    const denied = await t.api({ url: '/overlay-data/rotators/main?key=nope' });
    expect(denied.statusCode).toBe(401);
    const ok = await t.api({ url: `/overlay-data/rotators/main?key=${KEY}` });
    expect(ok.json()).toMatchObject({ panels: [{ type: 'stats', durationMs: 10000 }] });
  });
});
