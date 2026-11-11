import type { GuideEntry } from '@tiklive/contracts';
import { el } from '../core/dom.js';
import { describeAction, describeCost } from '../core/guide-format.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

export interface GiftGuideOptions {
  readonly layout: 'column' | 'row';
  /** Scroll speed in px per second at scale 1; 0 keeps the list still. */
  readonly speed: number;
  readonly title?: string | undefined;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The rules of the stream, as a menu: each gift with the reactions it triggers. It lists only
 * what the server sends (enabled rules for one exact gift). When the list does not fit it
 * scrolls in a loop, along the chosen orientation.
 */
export class GiftGuidePanel implements OverlayPanel {
  readonly element = el('section', 'panel guide');
  readonly subscription = { kind: 'giftguide' } as const;
  private readonly viewport = el('div', 'guide__viewport');
  private readonly track = el('ul', 'guide__track');
  private animation: Animation | undefined;

  constructor(private readonly options: GiftGuideOptions) {
    this.element.classList.add(`guide--${options.layout}`);
    if (options.title) this.element.append(el('h2', 'panel__title', options.title));
    this.viewport.append(this.track);
    this.element.append(this.viewport);
    this.showEmpty();
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'giftguide.snapshot') return;
    this.animation?.cancel();
    this.animation = undefined;
    const entries = message.payload.entries;
    if (entries.length === 0) {
      this.showEmpty();
      return;
    }
    this.track.replaceChildren(...entries.map((e) => this.render(e)));
    requestAnimationFrame(() => this.scroll());
  }

  unmount(): void {
    this.animation?.cancel();
  }

  private render(entry: GuideEntry): HTMLElement {
    const row = el('li', 'guide__item');
    const gift = el('div', 'guide__gift');
    if (entry.imageUrl) {
      const img = el('img', 'guide__image');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = entry.imageUrl;
      img.addEventListener('error', () => img.remove(), { once: true });
      gift.append(img);
    }
    gift.append(el('span', 'guide__name', entry.giftName));
    const cost = describeCost(entry.diamonds);
    if (cost) gift.append(el('span', 'guide__cost', cost));
    const actions = el('ul', 'guide__actions');
    for (const action of entry.actions) {
      actions.append(el('li', 'guide__action', describeAction(action)));
    }
    if (entry.conditional) actions.append(el('li', 'guide__note', 'según condiciones'));
    row.append(gift, actions);
    return row;
  }

  private showEmpty(): void {
    this.track.replaceChildren(el('li', 'guide__empty', 'Aún no hay regalos con reacciones'));
  }

  /** Loops the list when it overflows: the items are repeated once so the loop has no gap. */
  private scroll(): void {
    const horizontal = this.options.layout === 'row';
    const size = horizontal ? this.track.scrollWidth : this.track.scrollHeight;
    const view = horizontal ? this.viewport.clientWidth : this.viewport.clientHeight;
    if (this.options.speed <= 0 || reducedMotion() || size <= view + 1) return;
    const gap = Number.parseFloat(getComputedStyle(this.track).gap) || 0;
    const copies = [...this.track.children].map((child) => {
      const copy = child.cloneNode(true) as HTMLElement;
      copy.setAttribute('aria-hidden', 'true');
      return copy;
    });
    this.track.append(...copies);
    const scale =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) ||
      1;
    const distance = size + gap;
    const axis = horizontal ? 'X' : 'Y';
    this.animation = this.track.animate(
      [{ transform: `translate${axis}(0)` }, { transform: `translate${axis}(${-distance}px)` }],
      {
        duration: (distance / (this.options.speed * scale)) * 1000,
        iterations: Infinity,
        easing: 'linear',
      },
    );
  }
}
