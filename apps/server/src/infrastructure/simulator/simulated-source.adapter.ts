import type { RawLiveEvent } from '@tiklive/contracts';
import type {
  ConnectFailure,
  LiveEventSource,
  Unsubscribe,
} from '../../application/ports/live-event-source.js';

/**
 * LiveEventSource fed by code (dashboard, CLI, JSONL replay). It goes through the exact same
 * supervisor -> pipeline path as the real connector.
 */
export class SimulatedSource implements LiveEventSource {
  private connected = false;
  private nextFailure: ConnectFailure | undefined;
  private readonly eventHandlers = new Set<(event: RawLiveEvent) => void>();
  private readonly disconnectHandlers = new Set<(reason: string) => void>();

  start(): Promise<void> {
    const failure = this.nextFailure;
    this.nextFailure = undefined;
    if (failure) return Promise.reject(failure);
    this.connected = true;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  onEvent(handler: (event: RawLiveEvent) => void): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onDisconnect(handler: (reason: string) => void): Unsubscribe {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  emit(event: RawLiveEvent): boolean {
    if (!this.connected) return false;
    for (const handler of this.eventHandlers) handler(event);
    return true;
  }

  /** Test hook: makes the next start() fail with the given kind. */
  failNextStart(failure: ConnectFailure): void {
    this.nextFailure = failure;
  }

  /** Test hook: simulates a dropped connection. */
  dropConnection(reason = 'simulated drop'): void {
    if (!this.connected) return;
    this.connected = false;
    for (const handler of this.disconnectHandlers) handler(reason);
  }
}
