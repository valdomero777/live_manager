import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  LucideArrowRight,
  LucideDynamicIcon,
  LucideListFilter,
  LucideTriangleAlert,
  type LucideIcon,
} from '@lucide/angular';
import type { LiveEventType } from '@tiklive/contracts';
import { cn } from '../../lib/utils';
import { EVENT_META } from '../live/event-meta';
import { UI_ALERT } from '../ui/alert';
import { UiBadge } from '../ui/badge';
import { UI_CARD } from '../ui/card';
import { UiSwitch } from '../ui/switch';

export interface AutomationActionView {
  readonly icon: LucideIcon;
  readonly tone: string;
  readonly text: string;
}

/**
 * An automation at a glance: WHEN → IF → THEN in one line each, its on/off switch and its
 * actions (projected as `[automationCardActions]`).
 */
@Component({
  selector: 'app-automation-card',
  imports: [
    UiSwitch,
    UiBadge,
    ...UI_CARD,
    ...UI_ALERT,
    LucideDynamicIcon,
    LucideArrowRight,
    LucideListFilter,
    LucideTriangleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article uiCard [class]="cardClass()" [attr.aria-labelledby]="id() + '-name'">
      <header uiCardHeader>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <h2 class="truncate type-card-title" [id]="id() + '-name'">{{ name() }}</h2>
          @if (!enabled()) {
            <span uiBadge variant="outline">Pausada</span>
          }
          @for (b of badges(); track b) {
            <span uiBadge variant="secondary">{{ b }}</span>
          }
        </div>
        <div uiCardAction>
          <label class="type-caption hidden sm:inline" [for]="id() + '-switch'">
            {{ enabled() ? 'Activa' : 'Inactiva' }}
          </label>
          <ui-switch
            [inputId]="id() + '-switch'"
            [ariaLabel]="'Activar ' + name()"
            [checked]="enabled()"
            [disabled]="busy()"
            [controlled]="true"
            (toggled)="toggle.emit($event)"
          />
        </div>
      </header>

      <div uiCardContent>
        <ol
          class="grid gap-2 lg:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1fr)_auto_minmax(0,1.2fr)] lg:items-start lg:gap-3"
        >
          <li class="grid gap-1.5">
            <span class="type-overline text-muted-foreground">Cuando</span>
            <span class="inline-flex w-fit items-center gap-2 text-sm font-medium">
              <span [class]="trigger().tone" class="grid size-6 place-items-center rounded-md">
                <svg [lucideIcon]="trigger().icon" class="size-3.5" />
              </span>
              {{ trigger().label }}
            </span>
          </li>
          <li class="hidden pt-6 text-muted-foreground lg:block" aria-hidden="true">
            <svg lucideArrowRight class="size-4" />
          </li>
          <li class="grid gap-1.5">
            <span class="type-overline text-muted-foreground">Si</span>
            @if (conditions().length) {
              <ul class="grid gap-1">
                @for (c of conditions(); track $index) {
                  <li class="flex items-start gap-2 text-sm">
                    <svg
                      lucideListFilter
                      class="mt-0.5 size-3.5 shrink-0 text-info-text"
                      aria-hidden="true"
                    />
                    <span class="min-w-0 break-words">{{ c }}</span>
                  </li>
                }
              </ul>
            } @else {
              <span class="type-secondary">Siempre</span>
            }
          </li>
          <li class="hidden pt-6 text-muted-foreground lg:block" aria-hidden="true">
            <svg lucideArrowRight class="size-4" />
          </li>
          <li class="grid gap-1.5">
            <span class="type-overline text-muted-foreground">Entonces</span>
            <ul class="grid gap-1.5">
              @for (a of actions(); track $index) {
                <li class="flex items-start gap-2 text-sm">
                  <span
                    [class]="a.tone"
                    class="grid size-6 shrink-0 place-items-center rounded-md"
                    aria-hidden="true"
                  >
                    <svg [lucideIcon]="a.icon" class="size-3.5" />
                  </span>
                  <span class="min-w-0 pt-0.5 break-words">{{ a.text }}</span>
                </li>
              } @empty {
                <li class="type-secondary">Sin acciones</li>
              }
            </ul>
          </li>
        </ol>
      </div>

      @if (warning()) {
        <div uiCardContent>
          <div uiAlert variant="warning">
            <svg lucideTriangleAlert />
            <p uiAlertDescription>{{ warning() }}</p>
          </div>
        </div>
      }

      <footer uiCardFooter class="border-t border-border-subtle pt-4">
        <ng-content select="[automationCardActions]" />
      </footer>
    </article>
  `,
})
export class AutomationCard {
  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly enabled = input.required<boolean>();
  readonly event = input.required<LiveEventType>();
  readonly conditions = input<readonly string[]>([]);
  readonly actions = input.required<readonly AutomationActionView[]>();
  readonly badges = input<readonly string[]>([]);
  readonly warning = input('');
  readonly busy = input(false);
  readonly toggle = output<boolean>();

  protected readonly trigger = computed(() => EVENT_META[this.event()]);
  protected readonly cardClass = computed(() =>
    cn('transition-opacity', !this.enabled() && 'opacity-70'),
  );
}
