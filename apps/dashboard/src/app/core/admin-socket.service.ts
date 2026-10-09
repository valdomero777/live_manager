import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  API_PREFIX,
  AdminServerMessageSchema,
  LiveEventSchema,
  type AdminPayload,
  type ConnectorStatus,
  type HealthResponse,
  type LiveEvent,
} from '@tiklive/contracts';

export type RuleExecution = AdminPayload<'rule.executed'> & { readonly at: number };

/** Circular buffer of the latest events shown in the dashboard (spec 13). */
const EVENT_BUFFER = 500;
/** Rule executions kept for the dashboard's «Automatizaciones recientes». */
const EXECUTION_BUFFER = 50;
const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;

/**
 * Live feed from /ws/admin (connector state, accepted events, errors). Messages are validated
 * with the shared schemas; the session cookie authenticates the socket.
 */
@Injectable({ providedIn: 'root' })
export class AdminSocketService {
  readonly connected = signal(false);
  readonly connectorStatus = signal<ConnectorStatus | undefined>(undefined);
  readonly events = signal<readonly LiveEvent[]>([]);
  readonly lastError = signal<string | undefined>(undefined);
  /** Newest first; only what happened since this tab opened (the server keeps no history). */
  readonly ruleExecutions = signal<readonly RuleExecution[]>([]);
  /** True until the first history request finishes, so feeds can show a skeleton. */
  readonly historyLoading = signal(true);

  private socket: WebSocket | undefined;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private wanted = false;
  /** Counts connector.status messages, so a slow /health reply never overwrites a newer one. */
  private statusVersion = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  connect(): void {
    this.wanted = true;
    if (this.socket) return;
    void this.loadHistory();
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws/admin`);
    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.connected.set(true);
      void this.syncConnectorStatus();
    });
    socket.addEventListener('message', (e) => this.onMessage(e.data));
    socket.addEventListener('close', () => this.onClose());
    this.socket = socket;
  }

  disconnect(): void {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = undefined;
  }

  /** Events already received this session, so a panel opened mid-live is not empty. */
  private async loadHistory(): Promise<void> {
    try {
      const res = await fetch(`${API_PREFIX}/events/recent?limit=${EVENT_BUFFER}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const parsed = LiveEventSchema.array().safeParse(await res.json());
      if (!parsed.success) return;
      this.events.update((live) => {
        const seen = new Set(live.map((e) => e.id));
        return [...live, ...parsed.data.filter((e) => !seen.has(e.id))].slice(0, EVENT_BUFFER);
      });
    } catch {
      // history is a convenience; the live feed still works
    } finally {
      this.historyLoading.set(false);
    }
  }

  /** The socket only reports changes; ask once per (re)connection for the current state. */
  private async syncConnectorStatus(): Promise<void> {
    const version = this.statusVersion;
    try {
      const res = await fetch(`${API_PREFIX}/health`, { cache: 'no-store' });
      if (!res.ok) return;
      const health = (await res.json()) as HealthResponse;
      if (version === this.statusVersion) this.connectorStatus.set(health.connector);
    } catch {
      // the next connector.status message fills it in
    }
  }

  private onMessage(data: unknown): void {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      return;
    }
    const parsed = AdminServerMessageSchema.safeParse(json);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === 'connector.status') {
      this.statusVersion++;
      this.connectorStatus.set(message.payload);
    }
    if (message.type === 'event.received') {
      this.events.update((list) => [message.payload, ...list].slice(0, EVENT_BUFFER));
    }
    if (message.type === 'rule.executed') {
      const execution = { ...message.payload, at: message.ts };
      this.ruleExecutions.update((list) => [execution, ...list].slice(0, EXECUTION_BUFFER));
    }
    if (message.type === 'error.reported') {
      this.lastError.set(`${message.payload.module}: ${message.payload.message}`);
    }
  }

  private onClose(): void {
    this.socket = undefined;
    this.connected.set(false);
    if (!this.wanted) return;
    const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** this.attempt++);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
}
