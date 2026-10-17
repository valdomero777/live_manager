import type { Metric, Scope } from '@tiklive/contracts';
import { avatar, el, formatNumber } from '../core/dom.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

const UNITS: Readonly<Record<Metric, string>> = { diamonds: '🪙', gift_count: '🎁', likes: '❤' };
const DEFAULT_TITLES: Readonly<Record<Metric, string>> = {
  diamonds: 'Mejor donador',
  gift_count: 'Más regalos',
  likes: 'Top liker',
};

export interface TopGifterOptions {
  readonly metric: Metric;
  readonly scope: Scope;
  readonly title?: string | undefined;
  readonly showAlias: boolean;
}

/** Highlights only the leader of a ranking; on a tie the server's order decides. */
export class TopGifterPanel implements OverlayPanel {
  readonly element = el('section', 'panel topgifter');
  readonly subscription;
  private readonly body = el('div', 'topgifter__body');
  private leaderId: number | undefined;

  constructor(private readonly options: TopGifterOptions) {
    this.subscription = {
      kind: 'leaderboard',
      metric: options.metric,
      scope: options.scope,
    } as const;
    this.element.append(
      el('h2', 'panel__title', options.title ?? DEFAULT_TITLES[options.metric]),
      this.body,
    );
    this.body.append(this.emptyState());
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'leaderboard.snapshot') return;
    const leader = message.payload.rows[0];
    if (!leader) {
      this.leaderId = undefined;
      this.body.replaceChildren(this.emptyState());
      return;
    }
    const name = this.options.showAlias ? `@${leader.uniqueId}` : leader.nickname;
    const changed = this.leaderId !== leader.viewerId;
    this.leaderId = leader.viewerId;
    this.body.replaceChildren(
      avatar(leader.avatarUrl, 'topgifter__avatar'),
      el('span', 'topgifter__name', name),
      el('span', 'topgifter__value', `${formatNumber(leader.value)} ${UNITS[this.options.metric]}`),
    );
    if (changed) {
      this.body.classList.remove('topgifter__body--new');
      void this.body.offsetWidth;
      this.body.classList.add('topgifter__body--new');
    }
  }

  unmount(): void {}

  private emptyState(): HTMLElement {
    return el('span', 'topgifter__empty', 'Aún no hay datos');
  }
}
