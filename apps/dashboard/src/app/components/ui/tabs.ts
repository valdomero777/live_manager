import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { cn } from '../../lib/utils';

/** shadcn/ui Tabs: WAI-ARIA tabs with arrow-key navigation. Panels stay mounted (form state). */
@Component({
  selector: 'ui-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', 'data-slot': 'tabs' },
  template: '<ng-content />',
})
export class UiTabs {
  readonly value = model.required<string>();
  /** Prefix for the tab/panel ids. */
  readonly name = input('tabs');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('flex flex-col gap-4', this.userClass()));

  tabId(value: string): string {
    return `${this.name()}-tab-${value}`;
  }

  panelId(value: string): string {
    return `${this.name()}-panel-${value}`;
  }
}

@Directive({
  selector: '[uiTabsList]',
  host: {
    role: 'tablist',
    '[class]': 'classes()',
    '(keydown)': 'onKeydown($event)',
    'data-slot': 'tabs-list',
  },
})
export class UiTabsList {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 scrollbar-thin',
      this.userClass(),
    ),
  );

  protected onKeydown(event: KeyboardEvent): void {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const delta = keys[event.key];
    if (!delta) return;
    const tabs = [...this.el.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)')];
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    event.preventDefault();
    next?.focus();
    next?.click();
  }
}

@Directive({
  selector: 'button[uiTabsTrigger]',
  host: {
    type: 'button',
    role: 'tab',
    '[id]': 'tabs.tabId(value())',
    '[attr.aria-selected]': 'active()',
    '[attr.aria-controls]': 'tabs.panelId(value())',
    '[attr.tabindex]': 'active() ? 0 : -1',
    '[attr.data-state]': "active() ? 'active' : 'inactive'",
    '[class]': 'classes()',
    '(click)': 'tabs.value.set(value())',
    'data-slot': 'tabs-trigger',
  },
})
export class UiTabsTrigger {
  protected readonly tabs = inject(UiTabs);
  readonly value = input.required<string>({ alias: 'uiTabsTrigger' });
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly active = computed(() => this.tabs.value() === this.value());
  protected readonly classes = computed(() =>
    cn(
      'inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground',
      'transition-[color,background-color,box-shadow] outline-none hover:text-foreground',
      'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
      'data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm [&_svg]:size-3.5',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiTabsContent]',
  host: {
    role: 'tabpanel',
    '[id]': 'tabs.panelId(value())',
    '[attr.aria-labelledby]': 'tabs.tabId(value())',
    '[hidden]': 'tabs.value() !== value()',
    tabindex: '0',
    '[class]': 'classes()',
    'data-slot': 'tabs-content',
  },
})
export class UiTabsContent {
  protected readonly tabs = inject(UiTabs);
  readonly value = input.required<string>({ alias: 'uiTabsContent' });
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('outline-none', this.userClass()));
}

export const UI_TABS = [UiTabs, UiTabsList, UiTabsTrigger, UiTabsContent] as const;
