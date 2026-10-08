import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

const FEEDBACK_MS = 1_500;

/** Copies a value to the clipboard and confirms it for screen readers too. */
@Component({
  selector: 'app-copy-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="copy()" [attr.aria-label]="label() + ': copiar'">
      {{ copied() ? 'Copiado' : 'Copiar' }}
    </button>
    <span class="sr-only" role="status">{{ copied() ? 'Copiado al portapapeles' : '' }}</span>
  `,
})
export class CopyButton {
  readonly value = input.required<string>();
  readonly label = input('Valor');
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.value());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), FEEDBACK_MS);
  }
}
