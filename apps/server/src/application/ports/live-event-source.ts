import type { RawLiveEvent } from '@tiklive/contracts';
import type { ConnectFailureKind } from '../../domain/connector/connector-state.js';

export type Unsubscribe = () => void;

/** Thrown by LiveEventSource.start; the kind decides the retry strategy. */
export class ConnectFailure extends Error {
  constructor(
    readonly kind: ConnectFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectFailure';
  }
}

/**
 * Port isolating the unofficial TikTok connector (ADR 0002). Implementations make a single
 * connection attempt per start(); reconnection policy lives in ConnectorSupervisor so the real
 * adapter and the simulator share it.
 */
export interface LiveEventSource {
  /** Connects once. Rejects with ConnectFailure when the attempt fails. */
  start(target: string): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: RawLiveEvent) => void): Unsubscribe;
  /** Fired when an established connection drops without stop() being called. */
  onDisconnect(handler: (reason: string) => void): Unsubscribe;
}
