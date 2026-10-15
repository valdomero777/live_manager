import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UiFormField } from '../ui/form-field';
import { UiInput } from '../ui/input';
import { PublicUrlStore } from '../../core/public-url.store';

/** Optional tunnel address that replaces the host in every copied overlay link. */
@Component({
  selector: 'app-public-url-field',
  imports: [UiFormField, UiInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-form-field
      i18n-description
      i18n-label
      label="URL pública (túnel, opcional)"
      for="public-url"
      description="Si abres un túnel (por ejemplo cloudflared), pega aquí su dirección https://…trycloudflare.com y los enlaces copiados la usarán. Vacío = la dirección de arriba."
    >
      <input
        uiInput
        id="public-url"
        type="text"
        inputmode="url"
        autocomplete="off"
        placeholder="https://algo.trycloudflare.com"
        aria-describedby="public-url-description"
        [attr.aria-invalid]="store.invalid() ? 'true' : null"
        [value]="store.text()"
        (input)="store.set($any($event.target).value)"
      />
      @if (store.invalid()) {
        <p i18n role="alert" class="type-caption text-destructive">
          No es una dirección válida; se usa la de arriba.
        </p>
      }
    </ui-form-field>
  `,
})
export class PublicUrlField {
  protected readonly store = inject(PublicUrlStore);
}
