import {
  AdminClientMessageSchema,
  channelOf,
  ScreenClientMessageSchema,
  makeEnvelope,
  type ScreenClientMessage,
  type Subscription,
} from '@tiklive/contracts';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { Unsubscribe } from '../../application/ports/live-event-source.js';
import type { SocketConnection } from '../../application/ports/socket-connection.js';
import { isValidKey } from '../http/overlay-routes.js';
import type { HttpServices } from '../http/services.js';

const SCREEN_ID = z.string().regex(/^[a-z0-9_-]{1,32}$/);
const POLICY_VIOLATION = 1008;

function asConnection(socket: WebSocket): SocketConnection {
  return {
    send: (data) => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    },
    close: (code, reason) => socket.close(code, reason),
  };
}

function parseJson(raw: unknown): unknown {
  try {
    return JSON.parse(String(raw));
  } catch {
    return undefined;
  }
}

export function registerSocketRoutes(
  app: FastifyInstance,
  s: HttpServices,
  options: { overlayKey: () => string; preloadUrls: () => string[] },
): void {
  app.get('/ws/screen/:screenId', { websocket: true }, (socket, req) => {
    const screen = SCREEN_ID.safeParse((req.params as { screenId?: string }).screenId);
    const key = (req.query as { key?: unknown }).key;
    if (!screen.success || !isValidKey(key, options.overlayKey())) {
      socket.close(POLICY_VIOLATION, 'unauthorized');
      return;
    }
    new ScreenSession(screen.data, asConnection(socket), s, options.preloadUrls, req.log).attach(
      socket,
    );
  });

  app.get('/ws/admin', { websocket: true }, (socket, req) => {
    const connection = asConnection(socket);
    const unregister = s.admin.register(connection);
    connection.send(
      JSON.stringify(makeEnvelope('connector.status', s.supervisor.status(), Date.now())),
    );
    socket.on('message', (raw) => handleAdminMessage(raw, s, req.log));
    socket.on('close', unregister);
  });
}

/** One overlay/audio client: registers on client.hello and relays acknowledgements. */
class ScreenSession {
  private unregister: Unsubscribe | undefined;
  private unsubscribe: Unsubscribe | undefined;

  constructor(
    private readonly screen: string,
    private readonly connection: SocketConnection,
    private readonly s: HttpServices,
    private readonly preloadUrls: () => string[],
    private readonly log: FastifyBaseLogger,
  ) {}

  attach(socket: WebSocket): void {
    socket.on('message', (raw) => this.onMessage(raw));
    socket.on('close', () => {
      this.unregister?.();
      this.unsubscribe?.();
    });
  }

  private onMessage(raw: unknown): void {
    const parsed = ScreenClientMessageSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      this.log.warn({ screenId: this.screen }, 'invalid screen message discarded');
      return;
    }
    this.handle(parsed.data);
  }

  private handle(message: ScreenClientMessage): void {
    switch (message.type) {
      case 'client.hello':
        this.hello(message.payload.subscriptions);
        break;
      case 'action.done':
        this.s.actions.acknowledge(this.screen, message.payload.actionId, true);
        break;
      case 'action.failed':
        this.s.actions.acknowledge(
          this.screen,
          message.payload.actionId,
          false,
          message.payload.reason,
        );
        break;
      case 'ping':
        this.send('pong', {});
        break;
    }
  }

  /** Snapshot first, then deltas: subscriptions are registered after the initial send. */
  private hello(subscriptions: readonly Subscription[]): void {
    if (this.unregister) return;
    this.send('config.changed', { preloadUrls: this.preloadUrls() });
    this.unregister = this.s.screens.register(this.screen, this.connection);
    const channels = [...new Set(subscriptions.map(channelOf))];
    if (channels.length === 0) return;
    const { publisher, channels: gateway } = this.s.projections;
    void publisher
      .sendInitial(this.connection, channels)
      .catch((error: unknown) => this.log.error({ err: String(error) }, 'initial snapshot failed'))
      .finally(() => {
        this.unsubscribe = gateway.subscribe(this.connection, channels);
      });
  }

  private send(type: string, payload: object): void {
    this.connection.send(JSON.stringify(makeEnvelope(type, payload, Date.now())));
  }
}

function handleAdminMessage(raw: unknown, s: HttpServices, log: FastifyBaseLogger): void {
  const parsed = AdminClientMessageSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    log.warn({}, 'invalid admin message discarded');
    return;
  }
  const message = parsed.data;
  switch (message.type) {
    case 'simulator.emit':
      s.simulator.emitRaw(message.payload);
      break;
    case 'queue.clear':
      s.actions.clear(message.payload.screen);
      break;
    case 'session.reset':
      void s.projections.leaderboards
        .reset('session')
        .then(() => s.projections.publisher.refreshAll())
        .catch((error: unknown) => log.error({ err: String(error) }, 'session reset failed'));
      break;
  }
}
