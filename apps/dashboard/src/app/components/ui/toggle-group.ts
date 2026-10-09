import { Directive, computed, input } from '@angular/core';
import { cn } from '../../lib/utils';

/** shadcn/ui ToggleGroup (single choice) styled as a segmented control. */
@Directive({
  selector: '[uiToggleGroup]',
  host: { role: 'group', '[class]': 'classes()', 'data-slot': 'toggle-group' },
})
export class UiToggleGroup {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted p-1',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: 'button[uiToggleGroupItem]',
  host: {
    type: 'button',
    '[attr.aria-pressed]': 'pressed()',
    '[class]': 'classes()',
    'data-slot': 'toggle-group-item',
  },
})
export class UiToggleGroupItem {
  readonly pressed = input(false);
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground',
      'transition-[color,background-color,box-shadow] outline-none hover:text-foreground',
      'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
      'aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm [&_svg]:size-3.5',
      this.userClass(),
    ),
  );
}

export const UI_TOGGLE_GROUP = [UiToggleGroup, UiToggleGroupItem] as const;
