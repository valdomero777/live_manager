import type { Unsubscribe } from './live-event-source.js';

/** Transport-agnostic handle to one connected client. */
export interface SocketConnection {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface ScreenRegistry {
  register(screen: string, connection: SocketConnection): Unsubscribe;
}

export interface AdminRegistry {
  register(connection: SocketConnection): Unsubscribe;
}
