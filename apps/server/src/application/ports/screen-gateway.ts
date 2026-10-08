import type { ScreenServerMessage } from '@tiklive/contracts';
import type { Unsubscribe } from './live-event-source.js';

/** Delivers messages to overlay/audio screens connected by WebSocket. */
export interface ScreenGateway {
  /** Returns false when no client of that screen is connected. */
  send(screen: string, message: ScreenServerMessage): boolean;
  connectedCount(screen: string): number;
  connectedScreens(): Record<string, number>;
  onScreenConnected(handler: (screen: string) => void): Unsubscribe;
  onScreenDisconnected(handler: (screen: string) => void): Unsubscribe;
}
