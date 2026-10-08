import type { LeaderboardRow, Metric, Scope } from '@tiklive/contracts';
import { avatar, el, formatNumber } from '../core/dom.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

export const METRIC_LABELS: Readonly<Record<Metric, string>> = {
  diamonds: 'Top regalos',
  gift_count: 'Más regalos',
  likes: 'Top likes',
};

const UNIT_LABELS: Readonly<Record<Metric, string>> = {
  diamonds: '💎',
  gift_count: '🎁',
  likes: '❤',
};

export interface LeaderboardOptions {
  readonly metric: Metric;
  readonly scope: Scope;
  readonly limit: number;
  readonly title?: string | undefined;
  readonly showAlias: boolean;
}

/** Ranking whose rows are keyed by viewer so position changes animate (FLIP, transform only). */
export class LeaderboardPanel implements OverlayPanel {
  readonly element = el('section', 'panel leaderboard');
  readonly subscription;
  private readonly list = el('ol', 'leaderboard__list');
  private readonly rows = new Map<number, HTMLLIElement>();

  constructor(private readonly options: LeaderboardOptions) {
    this.subscription = {
      kind: 'leaderboard',
      metric: options.metric,
      scope: options.scope,
    } as const;
    const title = options.title ?? METRIC_LABELS[options.metric];
    this.element.append(el('h2', 'panel__title', title), this.list);
    this.list.append(this.emptyState());
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'leaderboard.snapshot') return;
    const rows = message.payload.rows.slice(0, this.options.limit);
    if (rows.length === 0) {
      this.rows.clear();
      this.list.replaceChildren(this.emptyState());
      return;
    }
    const before = this.positions();
    this.list.replaceChildren(...rows.map((row) => this.render(row)));
    for (const id of [...this.rows.keys()]) {
      if (!rows.some((r) => r.viewerId === id)) this.rows.delete(id);
    }
    this.animateMoves(before);
  }

  unmount(): void {
    this.rows.clear();
  }

  private render(row: LeaderboardRow): HTMLLIElement {
    let item = this.rows.get(row.viewerId);
    if (!item) {
      item = el('li', 'leaderboard__row');
      this.rows.set(row.viewerId, item);
    }
    const name = this.options.showAlias ? `@${row.uniqueId}` : row.nickname;
    const value = `${formatNumber(row.value)} ${UNIT_LABELS[this.options.metric]}`;
    item.dataset['rank'] = String(row.rank);
    item.replaceChildren(
      el('span', 'leaderboard__rank', String(row.rank)),
      avatar(row.avatarUrl, 'leaderboard__avatar'),
      el('span', 'leaderboard__name', name),
      el('span', 'leaderboard__value', value),
    );
    return item;
  }

  private emptyState(): HTMLElement {
    return el('li', 'leaderboard__empty', 'Aún no hay datos');
  }

  private positions(): Map<number, number> {
    const out = new Map<number, number>();
    for (const [id, item] of this.rows) {
      if (item.isConnected) out.set(id, item.getBoundingClientRect().top);
    }
    return out;
  }

  /** FLIP: invert each moved row to its old spot, then let CSS transition it back to zero. */
  private animateMoves(before: Map<number, number>): void {
    for (const [id, item] of this.rows) {
      const oldTop = before.get(id);
      if (oldTop === undefined) {
        item.classList.add('leaderboard__row--new');
        continue;
      }
      const delta = oldTop - item.getBoundingClientRect().top;
      if (delta === 0) continue;
      item.style.transition = 'none';
      item.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        item.style.transition = '';
        item.style.transform = '';
      });
    }
  }
}
