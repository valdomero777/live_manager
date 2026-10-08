import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { LIVE_EVENT_TYPES, type LiveEventType } from '@tiklive/contracts';
import { EVENT_META } from '../live/event-meta';

/**
 * WHEN: the LIVE event that starts an automation. Native radios styled as cards, so arrow keys,
 * forms and screen readers behave as a radio group.
 */
@Component({
  selector: 'app-trigger-selector',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset class="m-0 min-w-0 border-0 p-0">
      <legend class="sr-only">{{ label() }}</legend>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        @for (type of types(); track type) {
          @let meta = eventMeta[type];
          <label
            class="relative flex cursor-pointer items-center gap-2.5 rounded-lg border bg-surface p-2.5 transition-[border-color,background-color,box-shadow] hover:bg-surface-hover has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40 has-disabled:cursor-not-allowed has-disabled:opacity-50"
          >
            <input
              type="radio"
              class="sr-only"
              [name]="name()"
              [value]="type"
              [checked]="value() === type"
              [disabled]="disabled()"
              (change)="value.set(type)"
            />
            <span [class]="meta.tone" class="grid size-8 shrink-0 place-items-center rounded-md">
              <svg [lucideIcon]="meta.icon" class="size-4" />
            </span>
            <span class="min-w-0 truncate text-sm font-medium" [title]="meta.label">{{ meta.label }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
})
export class TriggerSelector {
  readonly value = model.required<LiveEventType>();
  readonly types = input<readonly LiveEventType[]>(LIVE_EVENT_TYPES);
  readonly name = input('trigger');
  readonly label = input('Evento que lo activa');
  readonly disabled = input(false);
  protected readonly eventMeta = EVENT_META;
}
