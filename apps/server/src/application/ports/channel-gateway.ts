import type { ScreenServerMessage } from '@tiklive/contracts';
import type { Unsubscribe } from './live-event-source.js';
import type { SocketConnection } from './socket-connection.js';

/** Data channels (leaderboards, goals, stats) that overlays subscribe to by name. */
export interface ChannelGateway {
  subscribe(connection: SocketConnection, channels: readonly string[]): Unsubscribe;
  publish(channel: string, message: ScreenServerMessage): void;
  hasSubscribers(channel: string): boolean;
}
