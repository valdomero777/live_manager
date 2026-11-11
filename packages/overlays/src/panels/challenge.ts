import { el, formatNumber } from '../core/dom.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

export interface ChallengeOptions {
  readonly goalId: number;
  readonly showNumbers: boolean;
  /** The creator's own milestone text, shown once the challenge is complete. Never executed. */
  readonly reward: string;
}

/**
 * A shared challenge: the progress of one goal that counts a single gift. It reuses the goal
 * channel and bar styles; the gift and the milestone come from the server's progress, so the
 * panel shows nothing it was not told. The reward is only a message, not an action.
 */
export class ChallengePanel implements OverlayPanel {
  readonly element = el('section', 'panel goal challenge');
  readonly subscription;
  private readonly title = el('h2', 'panel__title', 'Desafío');
  private readonly gift = el('p', 'challenge__gift');
  private readonly bar = el('div', 'goal__bar');
  private readonly fill = el('div', 'goal__fill');
  private readonly numbers = el('p', 'goal__numbers');
  private readonly done = el('p', 'challenge__done');

  constructor(private readonly options: ChallengeOptions) {
    this.subscription = { kind: 'goal', goalId: options.goalId } as const;
    this.bar.setAttribute('role', 'progressbar');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.bar.append(this.fill);
    this.done.hidden = true;
    this.element.append(this.title, this.gift, this.bar);
    if (options.showNumbers) this.element.append(this.numbers);
    this.element.append(this.done);
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'goal.progress') return;
    const p = message.payload;
    const complete = p.reached || p.ratio >= 1;
    this.title.textContent = p.cycle > 1 ? `${p.name} · nivel ${p.cycle}` : p.name;
    this.gift.textContent = p.giftName ? `Solo cuenta: ${p.giftName}` : '';
    this.gift.hidden = !p.giftName;
    this.fill.style.transform = `scaleX(${p.ratio})`;
    this.element.classList.toggle('goal--reached', complete);
    this.bar.setAttribute('aria-valuenow', String(Math.round(p.ratio * 100)));
    this.done.hidden = !complete;
    this.done.textContent = this.options.reward
      ? `¡Desafío completado! ${this.options.reward}`
      : '¡Desafío completado!';
    if (!this.options.showNumbers) return;
    const unit = p.metric === 'diamonds' ? '💎' : (p.giftName ?? '🎁');
    this.numbers.textContent = `${formatNumber(Math.min(p.current, p.target))} / ${formatNumber(p.target)} ${unit}`;
  }

  unmount(): void {}
}
