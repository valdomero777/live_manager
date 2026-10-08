import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  model,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { cn } from '../../lib/utils';

/**
 * shadcn/ui Switch: a real <button role="switch">. Works with [(checked)] or with reactive forms
 * (formControlName). A <label for="inputId"> activates it like a native control.
 */
@Component({
  selector: 'ui-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => UiSwitch), multi: true },
  ],
  host: { class: 'inline-flex', 'data-slot': 'switch' },
  template: `
    <button
      type="button"
      role="switch"
      [id]="inputId() || null"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.data-state]="checked() ? 'checked' : 'unchecked'"
      [disabled]="isDisabled()"
      [class]="trackClass()"
      (click)="toggle()"
      (blur)="onTouched()"
    >
      <span
        [attr.data-state]="checked() ? 'checked' : 'unchecked'"
        class="pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
      ></span>
    </button>
  `,
})
export class UiSwitch implements ControlValueAccessor {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly inputId = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly userClass = input<string>('', { alias: 'class' });

  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly trackClass = computed(() =>
    cn(
      'inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent px-px shadow-xs',
      'transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      this.userClass(),
    ),
  );

  private onChange: (value: boolean) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected toggle(): void {
    if (this.isDisabled()) return;
    this.checked.update((c) => !c);
    this.onChange(this.checked());
  }

  writeValue(value: unknown): void {
    this.checked.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }
}
