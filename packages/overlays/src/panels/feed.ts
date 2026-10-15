import type { FeedEventType, FeedItem } from '@tiklive/contracts';
import { el } from '../core/dom.js';
import { feedAction, feedIcon, selectFeed } from '../core/feed-format.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

export interface FeedOptions {
  readonly types: readonly FeedEventType[];
  readonly limit: number;
  readonly title?: string | undefined;
  readonly showAlias: boolean;
}

/** The latest events, newest on top; rows already shown are kept so only new ones animate. */
export class FeedPanel implements OverlayPanel {
  readonly element = el('section', 'panel feed');
  readonly subscription = { kind: 'feed' } as const;
  private readonly list = el('ul', 'feed__list');
  private readonly rows = new Map<string, HTMLElement>();

  constructor(private readonly options: FeedOptions) {
    if (options.title) this.element.append(el('h2', 'panel__title', options.title));
    this.element.append(this.list);
    this.showEmpty();
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'feed.snapshot') return;
    const items = selectFeed(message.payload.items, this.options.types, this.options.limit);
    if (items.length === 0) {
      this.rows.clear();
      this.showEmpty();
      return;
    }
    const first = this.rows.size === 0;
    const next = new Map<string, HTMLElement>();
    const nodes = items.map((item) => {
      const row = this.rows.get(item.id) ?? this.render(item, !first);
      next.set(item.id, row);
      return row;
    });
    this.list.replaceChildren(...nodes);
    this.rows.clear();
    next.forEach((row, id) => this.rows.set(id, row));
  }

  unmount(): void {}

  private render(item: FeedItem, animate: boolean): HTMLElement {
    const name = this.options.showAlias ? `@${item.uniqueId}` : item.nickname;
    const row = el('li', `feed__row feed__row--${item.type}`);
    if (animate) row.classList.add('feed__row--new');
    row.append(
      el('span', 'feed__icon', feedIcon(item.type)),
      el('span', 'feed__name', name),
      el('span', 'feed__action', feedAction(item)),
    );
    return row;
  }

  private showEmpty(): void {
    this.list.replaceChildren(el('li', 'feed__empty', 'Aún no hay eventos'));
  }
}
