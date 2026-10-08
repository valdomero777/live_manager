/**
 * Console view of what the server receives (manual phase 0 checks, RF-01):
 *
 *   npm run watch-events
 *
 * Prints connector state changes and every accepted event with its delay since TikTok created
 * it, so you can confirm real events arrive in under 2 s. Requires TIKLIVE_PASSWORD.
 */
import { AdminServerMessageSchema, type LiveEvent } from '@tiklive/contracts';
import { adminCookie, BASE_URL as HTTP_URL } from './admin-session.js';

const BASE_URL = HTTP_URL.replace(/^http/, 'ws');
const RETRY_MS = 2_000;

function describeEvent(e: LiveEvent): string {
  const who = 'viewer' in e ? `@${e.viewer.uniqueId}` : '';
  switch (e.type) {
    case 'comment':
      return `${who}: ${e.text}`;
    case 'gift':
      return `${who} ${e.quantity} x ${e.giftName} (${e.diamondValue * e.quantity} diamantes)`;
    case 'like':
      return `${who} +${e.likeDelta} likes (total sala ${e.totalLikes})`;
    case 'viewerCount':
      return `${e.viewerCount} espectadores`;
    default:
      return who;
  }
}

function print(raw: unknown): void {
  const parsed = AdminServerMessageSchema.safeParse(JSON.parse(String(raw)));
  if (!parsed.success) return;
  const message = parsed.data;
  const time = new Date().toLocaleTimeString();
  if (message.type === 'connector.status') {
    const { state, target, attempt, lastError } = message.payload;
    const extra = lastError ? ` · ${lastError}` : '';
    process.stdout.write(
      `${time} [conector] ${state} ${target ?? ''} intento ${attempt}${extra}\n`,
    );
  } else if (message.type === 'event.received') {
    const e = message.payload;
    const delay = ((Date.now() - e.occurredAt) / 1000).toFixed(1);
    process.stdout.write(`${time} [${e.type}] ${describeEvent(e)}  (+${delay} s)\n`);
  } else if (message.type === 'error.reported') {
    process.stdout.write(`${time} [error] ${message.payload.module}: ${message.payload.message}\n`);
  }
}

/** Node's WebSocket (undici) accepts headers, unlike browsers: the session cookie goes there. */
type NodeWebSocketInit = { headers: Record<string, string> };

async function connect(): Promise<void> {
  let cookie: string;
  try {
    cookie = await adminCookie();
  } catch (error) {
    process.stdout.write(`${error instanceof Error ? error.message : String(error)}\n`);
    setTimeout(() => void connect(), RETRY_MS);
    return;
  }
  const init: NodeWebSocketInit = { headers: { cookie } };
  const socket = new WebSocket(`${BASE_URL}/ws/admin`, init);
  socket.addEventListener('open', () => process.stdout.write(`Conectado a ${BASE_URL}/ws/admin\n`));
  socket.addEventListener('message', (e) => print(e.data));
  socket.addEventListener('close', () => {
    process.stdout.write('Servidor no disponible, reintentando...\n');
    setTimeout(() => void connect(), RETRY_MS);
  });
}

void connect();
