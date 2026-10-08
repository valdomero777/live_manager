import {
  ScreenServerMessageSchema,
  WS_VERSION,
  type ScreenClientMessage,
  type ScreenServerMessage,
  type Subscription,
} from '@tiklive/contracts';

export const CLIENT_VERSION = '0.1.0';
const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;
const PING_INTERVAL_MS = 20_000;

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface ScreenSocketOptions {
  readonly screenId: string;
  readonly key: string;
  readonly onMessage: (message: ScreenServerMessage) => void;
  readonly onState?: (state: ConnectionState) => void;
  /** Data channels to receive (leaderboards, goals, stats); sent in every client.hello. */
  readonly subscriptions?: readonly Subscription[];
}

type ClientPayload<T extends ScreenClientMessage['type']> = Extract<
  ScreenClientMessage,
  { type: T }
>['payload'];

/** WebSocket to /ws/screen/:id with exponential reconnect; re-sends client.hello on each open. */
export class ScreenSocket {
  private socket: WebSocket | undefined;
  private attempt = 0;
  private pingTimer: number | undefined;
  private closedByUser = false;

  constructor(private readonly options: ScreenSocketOptions) {}

  connect(): void {
    this.closedByUser = false;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}/ws/screen/${encodeURIComponent(this.options.screenId)}?key=${encodeURIComponent(this.options.key)}`;
    this.options.onState?.('connecting');
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => this.onOpen());
    socket.addEventListener('message', (e) => this.onRaw(e.data));
    socket.addEventListener('close', () => this.onClose());
    this.socket = socket;
  }

  send<T extends ScreenClientMessage['type']>(type: T, payload: ClientPayload<T>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ v: WS_VERSION, type, ts: Date.now(), payload }));
  }

  close(): void {
    this.closedByUser = true;
    this.socket?.close();
  }

  private onOpen(): void {
    this.attempt = 0;
    this.options.onState?.('open');
    this.send('client.hello', {
      screenId: this.options.screenId,
      clientVersion: CLIENT_VERSION,
      subscriptions: [...(this.options.subscriptions ?? [])],
    });
    this.pingTimer = window.setInterval(() => this.send('ping', {}), PING_INTERVAL_MS);
  }

  private onRaw(data: unknown): void {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      return;
    }
    const parsed = ScreenServerMessageSchema.safeParse(json);
    if (parsed.success) this.options.onMessage(parsed.data);
    else console.warn('[tiklive] invalid message discarded', parsed.error.issues);
  }

  private onClose(): void {
    window.clearInterval(this.pingTimer);
    this.options.onState?.('closed');
    if (this.closedByUser) return;
    const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** this.attempt++) + Math.random() * 500;
    window.setTimeout(() => this.connect(), delay);
  }
}
