import { CdkMenu, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { Directive, computed, input } from '@angular/core';
import { cn } from '../../lib/utils';

/**
 * shadcn/ui DropdownMenu styles for the CDK menu (keyboard navigation, typeahead, focus return):
 *   <button uiButton [cdkMenuTriggerFor]="menu">…</button>
 *   <ng-template #menu><div cdkMenu uiDropdownMenu><button cdkMenuItem uiDropdownMenuItem>…
 */
@Directive({
  selector: '[uiDropdownMenu]',
  host: { '[class]': 'classes()', 'data-slot': 'dropdown-menu-content' },
})
export class UiDropdownMenu {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'z-50 my-1 min-w-[10rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-overlay animate-overlay-in outline-none',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiDropdownMenuItem]',
  host: { '[class]': 'classes()', 'data-slot': 'dropdown-menu-item' },
})
export class UiDropdownMenuItem {
  readonly variant = input<'default' | 'destructive'>('default');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none select-none',
      'hover:bg-surface-hover focus:bg-surface-hover disabled:pointer-events-none disabled:opacity-50',
      "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground",
      this.variant() === 'destructive' &&
        'text-danger-text hover:bg-danger-soft focus:bg-danger-soft [&_svg]:text-danger-text',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiDropdownMenuLabel]',
  host: { '[class]': 'classes()' },
})
export class UiDropdownMenuLabel {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', this.userClass()),
  );
}

@Directive({
  selector: '[uiDropdownMenuSeparator]',
  host: { class: '-mx-1 my-1 block h-px bg-border', role: 'separator' },
})
export class UiDropdownMenuSeparator {}

export const UI_DROPDOWN_MENU = [
  CdkMenuTrigger,
  CdkMenu,
  CdkMenuItem,
  CdkMenuItemRadio,
  UiDropdownMenu,
  UiDropdownMenuItem,
  UiDropdownMenuLabel,
  UiDropdownMenuSeparator,
] as const;
