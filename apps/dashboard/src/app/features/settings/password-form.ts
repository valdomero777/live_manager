import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MIN_PASSWORD_LENGTH } from '@tiklive/contracts';
import { LucideCircleAlert, LucideCircleCheck } from '@lucide/angular';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiSpinner } from '../../components/ui/feedback';
import { UiFormField } from '../../components/ui/form-field';
import { UiInput } from '../../components/ui/input';
import { ApiError } from '../../core/api-client';
import { AuthStore } from '../../core/auth.store';

/** Changing the password signs out every other session (server side). */
@Component({
  selector: 'app-password-form',
  imports: [
    ReactiveFormsModule,
    UiButton,
    UiFormField,
    UiInput,
    UiSpinner,
    ...UI_CARD,
    ...UI_ALERT,
    LucideCircleAlert,
    LucideCircleCheck,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form uiCard [formGroup]="form" (ngSubmit)="save()" aria-labelledby="pw-title" novalidate>
      <header uiCardHeader>
        <h2 uiCardTitle id="pw-title">Contraseña del panel</h2>
        <p uiCardDescription>Al cambiarla se cierran las demás sesiones abiertas.</p>
      </header>
      <div uiCardContent class="grid max-w-md gap-4">
        <ui-form-field label="Contraseña actual" for="pw-current">
          <input
            uiInput
            id="pw-current"
            type="password"
            autocomplete="current-password"
            formControlName="current"
          />
        </ui-form-field>
        <ui-form-field
          label="Nueva contraseña"
          for="pw-next"
          [description]="'Mínimo ' + minLength + ' caracteres.'"
        >
          <input
            uiInput
            id="pw-next"
            type="password"
            autocomplete="new-password"
            formControlName="next"
            aria-describedby="pw-next-description"
          />
        </ui-form-field>
        <ui-form-field label="Repite la nueva contraseña" for="pw-confirm">
          <input
            uiInput
            id="pw-confirm"
            type="password"
            autocomplete="new-password"
            formControlName="confirm"
          />
        </ui-form-field>
      </div>
      @if (message(); as m) {
        <div uiCardContent>
          <div
            uiAlert
            [variant]="m.ok ? 'success' : 'destructive'"
            [attr.role]="m.ok ? 'status' : 'alert'"
          >
            @if (m.ok) {
              <svg lucideCircleCheck />
            } @else {
              <svg lucideCircleAlert />
            }
            <p uiAlertDescription>{{ m.text }}</p>
          </div>
        </div>
      }
      <footer uiCardFooter class="border-t border-border-subtle pt-4">
        <button uiButton type="submit" [disabled]="busy()">
          @if (busy()) {
            <ui-spinner />
          }
          Cambiar contraseña
        </button>
      </footer>
    </form>
  `,
})
export class PasswordForm {
  private readonly auth = inject(AuthStore);
  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | undefined>(undefined);
  protected readonly form = new FormGroup({
    current: new FormControl('', { nonNullable: true }),
    next: new FormControl('', { nonNullable: true }),
    confirm: new FormControl('', { nonNullable: true }),
  });

  protected async save(): Promise<void> {
    const { current, next, confirm } = this.form.getRawValue();
    if (next.length < MIN_PASSWORD_LENGTH) {
      this.message.set({
        ok: false,
        text: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      });
      return;
    }
    if (next !== confirm) {
      this.message.set({ ok: false, text: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.changePassword(current, next);
      this.form.reset();
      this.message.set({ ok: true, text: 'Contraseña cambiada.' });
    } catch (e) {
      this.message.set({ ok: false, text: e instanceof ApiError ? e.message : String(e) });
    } finally {
      this.busy.set(false);
    }
  }
}
