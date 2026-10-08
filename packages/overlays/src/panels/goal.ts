import type { GoalProgress } from '@tiklive/contracts';
import { el, formatNumber } from '../core/dom.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

const METRIC_UNITS: Readonly<Record<GoalProgress['metric'], string>> = {
  diamonds: '💎',
  gifts: '🎁',
  likes: '❤',
};

/** Progress bar animated with transform: scaleX only (GPU friendly, spec 12). */
export class GoalPanel implements OverlayPanel {
  readonly element = el('section', 'panel goal');
  readonly subscription;
  private readonly title = el('h2', 'panel__title', 'Meta');
  private readonly bar = el('div', 'goal__bar');
  private readonly fill = el('div', 'goal__fill');
  private readonly numbers = el('p', 'goal__numbers');

  constructor(
    goalId: number,
    private readonly showNumbers: boolean,
  ) {
    this.subscription = { kind: 'goal', goalId } as const;
    this.bar.setAttribute('role', 'progressbar');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.bar.append(this.fill);
    this.element.append(this.title, this.bar);
    if (showNumbers) this.element.append(this.numbers);
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'goal.progress') return;
    const p = message.payload;
    this.title.textContent = p.cycle > 1 ? `${p.name} · nivel ${p.cycle}` : p.name;
    this.fill.style.transform = `scaleX(${p.ratio})`;
    this.element.classList.toggle('goal--reached', p.reached || p.ratio >= 1);
    this.bar.setAttribute('aria-valuenow', String(Math.round(p.ratio * 100)));
    if (!this.showNumbers) return;
    const current = formatNumber(Math.min(p.current, p.target));
    this.numbers.textContent = `${current} / ${formatNumber(p.target)} ${METRIC_UNITS[p.metric]}`;
  }

  unmount(): void {}
}
