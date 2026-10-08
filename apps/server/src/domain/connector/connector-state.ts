import type { ConnectorState } from '@tiklive/contracts';
import { InvalidStateTransitionError } from '../shared/errors.js';

/** Allowed transitions (spec section 8). `stopped` is reachable from any state. */
const TRANSITIONS: Readonly<Record<ConnectorState, readonly ConnectorState[]>> = {
  idle: ['connecting', 'stopped'],
  connecting: ['connected', 'waiting_host', 'reconnecting', 'stopped'],
  connected: ['reconnecting', 'stopped'],
  waiting_host: ['connecting', 'stopped'],
  reconnecting: ['connecting', 'stopped'],
  stopped: ['idle', 'stopped'],
};

export function canTransition(from: ConnectorState, to: ConnectorState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ConnectorState, to: ConnectorState): void {
  if (!canTransition(from, to)) throw new InvalidStateTransitionError(from, to);
}

/** How a failed connection attempt should be handled. */
export type ConnectFailureKind = 'host_offline' | 'network' | 'protocol' | 'cancelled';
