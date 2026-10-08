import type { AdminMessageType, AdminPayload, ScreenServerMessage } from '@tiklive/contracts';
import type { AdminNotifier } from '../../src/application/ports/admin-notifier.js';
import type { Unsubscribe } from '../../src/application/ports/live-event-source.js';
import type { Cancel, IdGenerator, Scheduler } from '../../src/application/ports/scheduler.js';
import type { ScreenGateway } from '../../src/application/ports/screen-gateway.js';
import { FakeClock } from '../../src/domain/shared/time.js';

interface Timer {
  readonly id: number;
  dueAt: number;
  readonly fn: () => void;
  readonly intervalMs?: number;
}

/** Scheduler driven by a FakeClock: advance() fires due timers in time order. */
export class FakeScheduler implements Scheduler {
  private timers: Timer[] = [];
  private nextId = 0;

  constructor(readonly clock: FakeClock = new FakeClock(1_000_000)) {}

  setTimeout(fn: () => void, ms: number): Cancel {
    return this.add({ id: this.nextId++, dueAt: this.clock.now() + ms, fn });
  }

  setInterval(fn: () => void, ms: number): Cancel {
    return this.add({ id: this.nextId++, dueAt: this.clock.now() + ms, fn, intervalMs: ms });
  }

  advance(ms: number): void {
    const end = this.clock.now() + ms;
    for (let next = this.nextDue(end); next; next = this.nextDue(end)) {
      this.clock.set(next.dueAt);
      if (next.intervalMs === undefined) this.remove(next.id);
      else next.dueAt += next.intervalMs;
      next.fn();
    }
    this.clock.set(end);
  }

  get pending(): number {
    return this.timers.length;
  }

  private add(timer: Timer): Cancel {
    this.timers.push(timer);
    return () => this.remove(timer.id);
  }

  private remove(id: number): void {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  private nextDue(end: number): Timer | undefined {
    return this.timers
      .filter((t) => t.dueAt <= end)
      .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id)[0];
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  next(): string {
    return `id-${++this.n}`;
  }
}

export class RecordingNotifier implements AdminNotifier {
  readonly messages: { type: AdminMessageType; payload: unknown }[] = [];

  publish<T extends AdminMessageType>(type: T, payload: AdminPayload<T>): void {
    this.messages.push({ type, payload });
  }

  ofType<T extends AdminMessageType>(type: T): AdminPayload<T>[] {
    return this.messages.filter((m) => m.type === type).map((m) => m.payload as AdminPayload<T>);
  }
}

/** In-memory screens; `autoConnect` makes every screen look connected. */
export class FakeScreenGateway implements ScreenGateway {
  readonly sent: { screen: string; message: ScreenServerMessage }[] = [];
  private readonly counts = new Map<string, number>();
  private readonly connected = new Set<(screen: string) => void>();
  private readonly disconnected = new Set<(screen: string) => void>();

  connect(screen: string): void {
    this.counts.set(screen, (this.counts.get(screen) ?? 0) + 1);
    this.connected.forEach((l) => l(screen));
  }

  disconnect(screen: string): void {
    this.counts.set(screen, Math.max(0, (this.counts.get(screen) ?? 0) - 1));
    this.disconnected.forEach((l) => l(screen));
  }

  send(screen: string, message: ScreenServerMessage): boolean {
    if (this.connectedCount(screen) === 0) return false;
    this.sent.push({ screen, message });
    return true;
  }

  connectedCount(screen: string): number {
    return this.counts.get(screen) ?? 0;
  }

  connectedScreens(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  onScreenConnected(handler: (screen: string) => void): Unsubscribe {
    this.connected.add(handler);
    return () => this.connected.delete(handler);
  }

  onScreenDisconnected(handler: (screen: string) => void): Unsubscribe {
    this.disconnected.add(handler);
    return () => this.disconnected.delete(handler);
  }

  actionIds(screen?: string): string[] {
    return this.sent
      .filter((s) => screen === undefined || s.screen === screen)
      .map((s) => ('actionId' in s.message.payload ? s.message.payload.actionId : ''));
  }
}
