import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideInbox, type LucideIconInput } from '@lucide/angular';
import { cn } from '../../lib/utils';

/** What a list shows when it has nothing yet, with the next step to take. */
@Component({
  selector: 'app-empty-state',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `
    <span class="grid size-10 place-items-center rounded-full bg-surface-active text-muted-foreground">
      <svg [lucideIcon]="icon()" class="size-5" />
    </span>
    <div class="grid max-w-sm gap-1">
      <p class="text-sm font-medium">{{ title() }}</p>
      @if (description()) {
        <p class="type-secondary">{{ description() }}</p>
      }
    </div>
    <ng-content />
  `,
})
export class EmptyState {
  readonly icon = input<LucideIconInput>(LucideInbox);
  readonly title = input.required<string>();
  readonly description = input<string>('');
  /** Draws a dashed frame; turn off when the empty state already sits inside a card. */
  readonly bordered = input(true);
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() =>
    cn(
      'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
      this.bordered() && 'rounded-xl border border-dashed',
      this.userClass(),
    ),
  );
}
