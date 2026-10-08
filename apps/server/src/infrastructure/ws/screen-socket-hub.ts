import type { ScreenServerMessage } from '@tiklive/contracts';
import type { Unsubscribe } from '../../application/ports/live-event-source.js';
import type { ChannelGateway } from '../../application/ports/channel-gateway.js';
import type { ScreenGateway } from '../../application/ports/screen-gateway.js';
import type {
  ScreenRegistry,
  SocketConnection,
} from '../../application/ports/socket-connection.js';

type ScreenListener = (screen: string) => void;

/**
 * Tracks overlay/audio sockets per screenId (actions) and per data channel (snapshots).
 */
export class ScreenSocketHub implements ScreenGateway, ScreenRegistry, ChannelGateway {
  private readonly screens = new Map<string, Set<SocketConnection>>();
  private readonly channels = new Map<string, Set<SocketConnection>>();
  private readonly connectedListeners = new Set<ScreenListener>();
  private readonly disconnectedListeners = new Set<ScreenListener>();

  register(screen: string, connection: SocketConnection): Unsubscribe {
    let set = this.screens.get(screen);
    if (!set) {
      set = new Set();
      this.screens.set(screen, set);
    }
    set.add(connection);
    this.connectedListeners.forEach((l) => l(screen));
    return () => this.unregister(screen, connection);
  }

  send(screen: string, message: ScreenServerMessage): boolean {
    const set = this.screens.get(screen);
    if (!set || set.size === 0) return false;
    const data = JSON.stringify(message);
    for (const connection of set) connection.send(data);
    return true;
  }

  subscribe(connection: SocketConnection, channels: readonly string[]): Unsubscribe {
    for (const channel of channels) {
      let set = this.channels.get(channel);
      if (!set) {
        set = new Set();
        this.channels.set(channel, set);
      }
      set.add(connection);
    }
    return () => {
      for (const channel of channels) {
        const set = this.channels.get(channel);
        set?.delete(connection);
        if (set?.size === 0) this.channels.delete(channel);
      }
    };
  }

  publish(channel: string, message: ScreenServerMessage): void {
    const set = this.channels.get(channel);
    if (!set) return;
    const data = JSON.stringify(message);
    for (const connection of set) connection.send(data);
  }

  hasSubscribers(channel: string): boolean {
    return (this.channels.get(channel)?.size ?? 0) > 0;
  }

  broadcast(message: ScreenServerMessage): void {
    for (const screen of this.screens.keys()) this.send(screen, message);
  }

  connectedCount(screen: string): number {
    return this.screens.get(screen)?.size ?? 0;
  }

  connectedScreens(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [screen, set] of this.screens) out[screen] = set.size;
    return out;
  }

  onScreenConnected(handler: ScreenListener): Unsubscribe {
    this.connectedListeners.add(handler);
    return () => this.connectedListeners.delete(handler);
  }

  onScreenDisconnected(handler: ScreenListener): Unsubscribe {
    this.disconnectedListeners.add(handler);
    return () => this.disconnectedListeners.delete(handler);
  }

  closeAll(): void {
    for (const set of this.screens.values()) set.forEach((c) => c.close(1001, 'server shutdown'));
    this.screens.clear();
    this.channels.clear();
  }

  private unregister(screen: string, connection: SocketConnection): void {
    const set = this.screens.get(screen);
    if (!set?.delete(connection)) return;
    this.disconnectedListeners.forEach((l) => l(screen));
  }
}
