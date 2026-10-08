import { makeEnvelope, type AdminMessageType, type AdminPayload } from '@tiklive/contracts';
import type { AdminNotifier } from '../../application/ports/admin-notifier.js';
import type { Unsubscribe } from '../../application/ports/live-event-source.js';
import type { Clock } from '../../domain/shared/time.js';
import type { AdminRegistry, SocketConnection } from '../../application/ports/socket-connection.js';

/** Broadcasts operational messages to every connected dashboard. */
export class AdminSocketHub implements AdminNotifier, AdminRegistry {
  private readonly connections = new Set<SocketConnection>();

  constructor(private readonly clock: Clock) {}

  register(connection: SocketConnection): Unsubscribe {
    this.connections.add(connection);
    return () => this.connections.delete(connection);
  }

  publish<T extends AdminMessageType>(type: T, payload: AdminPayload<T>): void {
    if (this.connections.size === 0) return;
    const data = JSON.stringify(makeEnvelope(type, payload, this.clock.now()));
    for (const connection of this.connections) connection.send(data);
  }

  sendTo<T extends AdminMessageType>(
    connection: SocketConnection,
    type: T,
    payload: AdminPayload<T>,
  ): void {
    connection.send(JSON.stringify(makeEnvelope(type, payload, this.clock.now())));
  }

  closeAll(): void {
    this.connections.forEach((c) => c.close(1001, 'server shutdown'));
    this.connections.clear();
  }
}
