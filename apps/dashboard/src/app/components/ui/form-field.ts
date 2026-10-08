import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideCircleAlert } from '@lucide/angular';
import { cn } from '../../lib/utils';
import { UiLabel } from './input';

/** Ids a control should list in aria-describedby when it sits inside <ui-form-field>. */
export function describedBy(
  id: string,
  opts: { description?: boolean; error?: string | null | undefined },
): string | null {
  const ids = [opts.description ? `${id}-description` : '', opts.error ? `${id}-error` : ''];
  return ids.filter(Boolean).join(' ') || null;
}

/**
 * shadcn/ui Form field layout: label, control, description and the error right below the
 * control (never only in a toast). The control itself is projected and keeps its own id.
 */
@Component({
  selector: 'ui-form-field',
  imports: [UiLabel, LucideCircleAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', 'data-slot': 'form-field' },
  template: `
    @if (label()) {
      <label uiLabel [attr.for]="for() || null">
        {{ label() }}
        @if (optional()) {
          <span class="type-caption font-normal">(opcional)</span>
        }
        <ng-content select="[uiFieldLabelExtra]" />
      </label>
    }
    <ng-content />
    @if (description()) {
      <p class="type-caption" [id]="for() + '-description'">{{ description() }}</p>
    }
    <ng-content select="[uiFieldDescription]" />
    @if (error()) {
      <p
        class="flex items-center gap-1.5 text-xs font-medium text-danger-text"
        [id]="for() + '-error'"
        role="alert"
      >
        <svg lucideCircleAlert class="size-3.5" />{{ error() }}
      </p>
    }
  `,
})
export class UiFormField {
  readonly label = input<string>('');
  /** Id of the projected control: links the label, description and error. */
  readonly for = input<string>('');
  readonly description = input<string | undefined>();
  readonly error = input<string | null | undefined>();
  readonly optional = input(false);
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() => cn('field-stack', this.userClass()));
}
