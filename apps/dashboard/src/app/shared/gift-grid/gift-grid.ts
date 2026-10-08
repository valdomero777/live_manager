import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { GiftInfo } from '@tiklive/contracts';
import { GiftsStore } from '../../core/gifts.store';

/** Gifts shown before the list is filtered: the grid stays light with 600+ gifts. */
const PAGE = 60;

/**
 * Searchable grid of TikTok's gifts with their price in coins. Clicking a gift emits it; the
 * gift matching `selected` (id or name) is highlighted.
 */
@Component({
  selector: 'app-gift-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gift-grid.html',
  styleUrl: './gift-grid.css',
})
export class GiftGrid {
  readonly selected = input<string | number | null | undefined>();
  readonly label = input('Regalos de TikTok');
  readonly pick = output<GiftInfo>();

  protected readonly store = inject(GiftsStore);
  protected readonly query = signal('');
  protected readonly limit = signal(PAGE);

  protected readonly filtered = computed(() => {
    const gifts = this.store.catalog()?.gifts ?? [];
    const q = this.query().trim().toLowerCase();
    if (!q) return gifts;
    return gifts.filter((g) => g.name.toLowerCase().includes(q) || String(g.id) === q);
  });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  constructor() {
    void this.store.load();
  }

  protected isSelected(gift: GiftInfo): boolean {
    const s = this.selected();
    if (s === null || s === undefined || s === '') return false;
    return typeof s === 'number' ? gift.id === s : gift.name.toLowerCase() === s.toLowerCase();
  }

  protected search(value: string): void {
    this.query.set(value);
    this.limit.set(PAGE);
  }

  protected more(): void {
    this.limit.update((n) => n + PAGE);
  }

  protected hideBroken(event: Event): void {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }
}
