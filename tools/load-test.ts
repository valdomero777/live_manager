/**
 * Release gate (spec 15): N simulated gifts per second through the full app (HTTP -> pipeline ->
 * SQLite -> projections -> WebSocket) and the lag until the leaderboard snapshot reflects them.
 *
 *   npm run load-test -- --rate 1000 --seconds 1
 *
 * Fails (exit 1) when the snapshot lags more than 500 ms behind the last event.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { API_PREFIX, ScreenServerMessageSchema, simulatedViewer } from '@tiklive/contracts';
import { startTestApp, TEST_OVERLAY_KEY as KEY } from '../apps/server/test/support/test-app.js';

const MAX_LAG_MS = 500;
const USERS = 20;

const { values } = parseArgs({
  options: { rate: { type: 'string', default: '1000' }, seconds: { type: 'string', default: '1' } },
});
const rate = Number(values.rate);
const total = rate * Number(values.seconds);

const dir = mkdtempSync(join(tmpdir(), 'tiklive-load-'));
// A real file database (not :memory:) so the measurement includes disk writes.
const t = await startTestApp({ DB_PATH: join(dir, 'app.db'), LOG_LEVEL: 'error' });
const { app } = t;

const ws = await app.http.injectWS(`/ws/screen/loadtest?key=${KEY}`);
let lastEmitAt = 0;
const caughtUp = new Promise<number>((resolve) => {
  ws.on('message', (raw: Buffer) => {
    const msg = ScreenServerMessageSchema.parse(JSON.parse(raw.toString()));
    if (msg.type !== 'leaderboard.snapshot') return;
    const sum = msg.payload.rows.reduce((acc, r) => acc + r.value, 0);
    if (sum >= total) resolve(performance.now());
  });
});
ws.send(
  JSON.stringify({
    v: 1,
    type: 'client.hello',
    ts: Date.now(),
    payload: {
      screenId: 'loadtest',
      clientVersion: 'load',
      subscriptions: [{ kind: 'leaderboard', metric: 'diamonds', scope: 'session' }],
    },
  }),
);

const started = performance.now();
for (let i = 0; i < total; i++) {
  const due = started + (i * 1000) / rate;
  const wait = due - performance.now();
  if (wait > 1) await new Promise((r) => setTimeout(r, wait));
  const raw = {
    kind: 'gift',
    msgId: `load-${i}`,
    occurredAt: Date.now(),
    viewer: simulatedViewer(`user${i % USERS}`),
    giftId: 5655,
    giftName: 'Rose',
    diamondValue: 1,
    quantity: 1,
    streakable: false,
    streakEnded: true,
  };
  await t.api({ method: 'POST', url: `${API_PREFIX}/simulator/emit`, payload: { raw } });
  lastEmitAt = performance.now();
}
const emitSeconds = (lastEmitAt - started) / 1000;

const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(Number.NaN), 30_000));
const caughtUpAt = await Promise.race([caughtUp, timeout]);
const lag = caughtUpAt - lastEmitAt;

process.stdout.write(
  `${total} events in ${emitSeconds.toFixed(2)} s (${(total / emitSeconds).toFixed(0)}/s); ` +
    `leaderboard lag after last event: ${Number.isNaN(lag) ? 'timeout' : `${lag.toFixed(0)} ms`}\n`,
);
ws.terminate();
await t.stop().catch(() => undefined);
rmSync(dir, { recursive: true, force: true });
process.exit(lag <= MAX_LAG_MS ? 0 : 1);
