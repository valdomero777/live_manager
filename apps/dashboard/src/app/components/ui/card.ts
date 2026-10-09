import { Directive, computed, input } from '@angular/core';
import { cn } from '../../lib/utils';

/**
 * shadcn/ui Card as attribute directives: any element (section, article, form, h2…) can be a
 * card part, so landmarks and heading levels stay correct.
 */
@Directive({
  selector: '[uiCard]',
  host: { '[class]': 'classes()', 'data-slot': 'card' },
})
export class UiCard {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'flex min-w-0 flex-col gap-5 rounded-xl border bg-card py-5 text-card-foreground shadow-card',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiCardHeader]',
  host: { '[class]': 'classes()', 'data-slot': 'card-header' },
})
export class UiCardHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 px-5',
      'has-data-[slot=card-action]:grid-cols-[1fr_auto]',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiCardTitle]',
  host: { '[class]': 'classes()', 'data-slot': 'card-title' },
})
export class UiCardTitle {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('flex items-center gap-2 type-card-title [&>svg]:size-4', this.userClass()),
  );
}

@Directive({
  selector: '[uiCardDescription]',
  host: { '[class]': 'classes()', 'data-slot': 'card-description' },
})
export class UiCardDescription {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('type-secondary', this.userClass()));
}

@Directive({
  selector: '[uiCardAction]',
  host: { '[class]': 'classes()', 'data-slot': 'card-action' },
})
export class UiCardAction {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'col-start-2 row-span-2 row-start-1 flex items-center gap-2 self-start justify-self-end',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiCardContent]',
  host: { '[class]': 'classes()', 'data-slot': 'card-content' },
})
export class UiCardContent {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('px-5', this.userClass()));
}

@Directive({
  selector: '[uiCardFooter]',
  host: { '[class]': 'classes()', 'data-slot': 'card-footer' },
})
export class UiCardFooter {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('flex flex-wrap items-center gap-2 px-5', this.userClass()),
  );
}

export const UI_CARD = [
  UiCard,
  UiCardHeader,
  UiCardTitle,
  UiCardDescription,
  UiCardAction,
  UiCardContent,
  UiCardFooter,
] as const;
