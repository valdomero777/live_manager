import { avatar, el, formatNumber } from '../core/dom.js';
import type { SnapshotMessage } from '../core/snapshot-router.js';
import type { OverlayPanel } from './panel.js';

export interface TopStreakOptions {
  readonly title?: string | undefined;
  readonly showAlias: boolean;
}

/**
 * The longest gift streak of the session. It reuses the top-gifter card layout. Until a streak
 * is completed there is nothing to show, so the card says so instead of guessing.
 */
export class TopStreakPanel implements OverlayPanel {
  readonly element = el('section', 'panel topgifter');
  readonly subscription = { kind: 'streak' } as const;
  private readonly body = el('div', 'topgifter__body');
  private leaderKey: string | undefined;

  constructor(private readonly options: TopStreakOptions) {
    this.element.append(el('h2', 'panel__title', options.title ?? 'Racha más larga'), this.body);
    this.body.append(this.emptyState());
  }

  update(message: SnapshotMessage): void {
    if (message.type !== 'streak.snapshot') return;
    const leader = message.payload.leader;
    if (!leader) {
      this.leaderKey = undefined;
      this.body.replaceChildren(this.emptyState());
      return;
    }
    const name = this.options.showAlias ? `@${leader.uniqueId}` : leader.nickname;
    const key = `${leader.uniqueId}:${leader.count}:${leader.achievedAt}`;
    const changed = this.leaderKey !== key;
    this.leaderKey = key;
    this.body.replaceChildren(
      avatar(leader.avatarUrl, 'topgifter__avatar'),
      el('span', 'topgifter__name', name),
      el('span', 'topgifter__value', `${formatNumber(leader.count)} × ${leader.giftName}`),
    );
    if (changed) {
      this.body.classList.remove('topgifter__body--new');
      void this.body.offsetWidth;
      this.body.classList.add('topgifter__body--new');
    }
  }

  unmount(): void {}

  private emptyState(): HTMLElement {
    return el('span', 'topgifter__empty', 'Aún no hay rachas');
  }
}
