import type { StatsField, StatsSnapshot } from '@tiklive/contracts';
import { el, formatNumber } from '../core/dom.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

const LABELS: Readonly<Record<StatsField, string>> = {
  viewers: 'Espectadores',
  peakViewers: 'Pico',
  likes: 'Likes',
  diamonds: 'Diamantes',
  newFollowers: 'Nuevos seguidores',
  duration: 'En vivo',
};

const TICK_MS = 1_000;

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Live counters. The duration is computed client-side; its 1 s timer runs only if shown. */
export class StatsPanel implements OverlayPanel {
  readonly element = el('section', 'panel stats');
  readonly subscription = { kind: 'stats' } as const;
  private readonly values = new Map<StatsField, HTMLElement>();
  private startedAt: number | null = null;
  private timer: number | undefined;

  constructor(
    private readonly fields: readonly StatsField[],
    layout: 'row' | 'column',
  ) {
    this.element.classList.add(`stats--${layout}`);
    for (const field of fields) {
      const value = el('span', 'stats__value', '–');
      const item = el('div', 'stats__item');
      item.append(value, el('span', 'stats__label', LABELS[field]));
      this.element.append(item);
      this.values.set(field, value);
    }
    if (fields.includes('duration')) this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'stats.snapshot') return;
    const s: StatsSnapshot = message.payload;
    this.startedAt = s.startedAt;
    for (const field of this.fields) {
      if (field !== 'duration') this.set(field, formatNumber(s[field]));
    }
    this.tick();
  }

  unmount(): void {
    window.clearInterval(this.timer);
  }

  private tick(): void {
    if (!this.values.has('duration')) return;
    const text = this.startedAt === null ? '–' : formatDuration(Date.now() - this.startedAt);
    this.set('duration', text);
  }

  private set(field: StatsField, text: string): void {
    const node = this.values.get(field);
    if (node && node.textContent !== text) node.textContent = text;
  }
}
