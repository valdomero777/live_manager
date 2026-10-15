import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { LucideCheck, LucideCopy } from '@lucide/angular';
import { UiButton } from '../ui/button';

const FEEDBACK_MS = 1_500;

/** Copies a value to the clipboard and confirms it for screen readers too. */
@Component({
  selector: 'app-copy-button',
  imports: [UiButton, LucideCopy, LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button
      uiButton
      variant="outline"
      size="sm"
      type="button"
      (click)="copy()"
      [attr.aria-label]="copyLabel()"
    >
      @if (copied()) {
        <svg lucideCheck class="text-success-text" /> <ng-container i18n>Copiado</ng-container>
      } @else {
        <svg lucideCopy /> <ng-container i18n>Copiar</ng-container>
      }
    </button>
    <span class="sr-only" role="status">
      @if (copied()) {
        <ng-container i18n>Copiado al portapapeles</ng-container>
      }
    </span>
  `,
})
export class CopyButton {
  readonly value = input.required<string>();
  readonly label = input($localize`Valor`);
  protected readonly copied = signal(false);
  protected readonly copyLabel = computed(() => $localize`${this.label()}\: copiar`);

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.value());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), FEEDBACK_MS);
  }
}
