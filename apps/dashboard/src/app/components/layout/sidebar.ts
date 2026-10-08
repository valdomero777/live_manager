import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideDynamicIcon,
  LucidePanelLeftClose,
  LucidePanelLeftOpen,
  LucideRadio,
} from '@lucide/angular';
import { UiButton } from '../ui/button';
import { UiTooltip } from '../ui/tooltip';
import { NAVIGATION } from './navigation';

/**
 * Main navigation. As a desktop rail it can collapse to icons (with tooltips); inside the mobile
 * sheet it is always expanded.
 */
@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    LucideDynamicIcon,
    LucideRadio,
    LucidePanelLeftClose,
    LucidePanelLeftOpen,
    UiButton,
    UiTooltip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col bg-sidebar' },
  template: `
    <div class="flex h-14 shrink-0 items-center gap-2.5 border-b px-4" [class.justify-center]="collapsed()" [class.px-0]="collapsed()">
      <span
        class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs"
        aria-hidden="true"
      >
        <svg lucideRadio class="size-4" />
      </span>
      @if (!collapsed()) {
        <span class="grid leading-tight">
          <span class="text-sm font-semibold tracking-tight">TikLive</span>
          <span class="type-caption">Automatización LIVE</span>
        </span>
      }
    </div>

    <nav aria-label="Principal" class="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin" [class.px-2]="collapsed()">
      @for (group of navigation; track group.label; let first = $first) {
        <div class="grid gap-0.5" [class.mt-5]="!first && !collapsed()" [class.mt-3]="!first && collapsed()">
          @if (collapsed()) {
            @if (!first) {
              <span class="mx-auto mb-2 block h-px w-6 bg-border" aria-hidden="true"></span>
            }
          } @else {
            <p class="mb-1 px-2 type-overline text-muted-foreground">{{ group.label }}</p>
          }
          <ul class="grid gap-0.5">
            @for (item of group.items; track item.path) {
              <li>
                <a
                  [routerLink]="item.path"
                  routerLinkActive="bg-surface-active !text-foreground [&_svg]:!text-primary font-medium"
                  [routerLinkActiveOptions]="{ exact: !!item.exact }"
                  ariaCurrentWhenActive="page"
                  [uiTooltip]="item.label"
                  tooltipSide="right"
                  [tooltipDisabled]="!collapsed()"
                  [attr.aria-label]="collapsed() ? item.label : null"
                  (click)="navigate.emit()"
                  class="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  [class.justify-center]="collapsed()"
                >
                  <svg [lucideIcon]="item.icon" class="size-4 shrink-0" />
                  @if (!collapsed()) {
                    <span class="truncate">{{ item.label }}</span>
                  }
                </a>
              </li>
            }
          </ul>
        </div>
      }
    </nav>

    @if (collapsible()) {
      <div class="shrink-0 border-t p-3" [class.px-2]="collapsed()">
        <button
          uiButton
          variant="ghost"
          size="sm"
          type="button"
          class="w-full text-muted-foreground"
          [class.justify-start]="!collapsed()"
          [attr.aria-expanded]="!collapsed()"
          [attr.aria-label]="collapsed() ? 'Expandir menú' : 'Contraer menú'"
          [uiTooltip]="collapsed() ? 'Expandir menú' : ''"
          tooltipSide="right"
          (click)="toggle.emit()"
        >
          @if (collapsed()) {
            <svg lucidePanelLeftOpen />
          } @else {
            <svg lucidePanelLeftClose /> Contraer
          }
        </button>
      </div>
    }
  `,
})
export class Sidebar {
  readonly collapsed = input(false);
  readonly collapsible = input(true);
  readonly toggle = output();
  /** A link was followed (closes the mobile sheet). */
  readonly navigate = output();
  protected readonly navigation = NAVIGATION;
}
