/**
 * Simulator CLI (RF-04): sends synthetic events to a running server.
 *
 *   npm run simulate -- gift --user ana --gift Rose --diamonds 1 --quantity 10 --streak
 *   npm run simulate -- comment --user ana --text "hola!"
 *   npm run simulate -- like --count 50
 *   npm run simulate -- follow | join | share --user ana
 *   npm run simulate -- viewers --count 120
 *   npm run simulate -- full            # gift + like + comment to check audio and overlays
 *   npm run simulate -- replay recording.jsonl --speed 2
 *
 * Requires the dashboard password in TIKLIVE_PASSWORD.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  API_PREFIX,
  RawLiveEventSchema,
  type RawLiveEvent,
  type SimulatorTemplateInput,
} from '@tiklive/contracts';
import { adminCookie, BASE_URL } from './admin-session.js';

let session: Promise<string> | undefined;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    user: { type: 'string' },
    gift: { type: 'string' },
    'gift-id': { type: 'string' },
    diamonds: { type: 'string' },
    quantity: { type: 'string' },
    streak: { type: 'boolean', default: false },
    text: { type: 'string' },
    count: { type: 'string' },
    speed: { type: 'string', default: '1' },
  },
});

const num = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

function defined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function templateFor(kind: string): SimulatorTemplateInput {
  const user = values.user;
  switch (kind) {
    case 'gift':
      return defined({
        kind: 'gift',
        user,
        giftName: values.gift,
        giftId: num(values['gift-id']),
        diamonds: num(values.diamonds),
        quantity: num(values.quantity),
        streak: values.streak,
      });
    case 'comment':
      return defined({ kind: 'comment', user, text: values.text });
    case 'like':
      return defined({ kind: 'like', user, count: num(values.count) });
    case 'follow':
    case 'join':
    case 'share':
      return defined({ kind, user });
    case 'viewers':
      return defined({ kind: 'viewerCount', viewers: num(values.count) });
    case 'end':
      return { kind: 'streamEnd' };
    default:
      throw new Error(`Unknown event kind "${kind}"`);
  }
}

async function post(body: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}${API_PREFIX}/simulator/emit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: await (session ??= adminCookie()) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  process.stdout.write(`${res.status} ${text}\n`);
}

async function replay(path: string, speed: number): Promise<void> {
  const events: RawLiveEvent[] = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => RawLiveEventSchema.parse(JSON.parse(line)));
  let previous = events[0]?.occurredAt ?? 0;
  for (const raw of events) {
    const wait = Math.max(0, (raw.occurredAt - previous) / speed);
    previous = raw.occurredAt;
    await new Promise((resolve) => setTimeout(resolve, wait));
    await post({ raw: { ...raw, occurredAt: Date.now() } });
  }
}

async function main(): Promise<void> {
  const [kind = 'full', file] = positionals;
  if (kind === 'replay') {
    if (!file) throw new Error('replay needs a .jsonl file');
    return replay(file, Number(values.speed));
  }
  if (kind === 'full') {
    for (const k of ['gift', 'like', 'comment']) await post(templateFor(k));
    return;
  }
  await post(templateFor(kind));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
