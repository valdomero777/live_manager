import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MIN_PASSWORD_LENGTH } from '@tiklive/contracts';
import { ApiError } from '../../core/api-client';
import { AuthStore } from '../../core/auth.store';

/** Changing the password signs out every other session (server side). */
@Component({
  selector: 'app-password-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="card stack"
      [formGroup]="form"
      (ngSubmit)="save()"
      aria-labelledby="pw-title"
      novalidate
    >
      <div>
        <h2 id="pw-title">Contraseña del panel</h2>
        <p class="muted">Al cambiarla se cierran las demás sesiones abiertas.</p>
      </div>
      <div class="grid">
        <div class="field">
          <label for="pw-current">Contraseña actual</label>
          <input
            id="pw-current"
            type="password"
            autocomplete="current-password"
            formControlName="current"
          />
        </div>
        <div class="field">
          <label for="pw-next">Nueva contraseña</label>
          <input
            id="pw-next"
            type="password"
            autocomplete="new-password"
            formControlName="next"
            aria-describedby="pw-help"
          />
          <small id="pw-help" class="muted">Mínimo {{ minLength }} caracteres.</small>
        </div>
        <div class="field">
          <label for="pw-confirm">Repite la nueva contraseña</label>
          <input
            id="pw-confirm"
            type="password"
            autocomplete="new-password"
            formControlName="confirm"
          />
        </div>
      </div>
      @if (message(); as m) {
        <p class="notice" [class.ok]="m.ok" [class.danger]="!m.ok" role="status">{{ m.text }}</p>
      }
      <div class="row">
        <button type="submit" [disabled]="busy()">Cambiar contraseña</button>
      </div>
    </form>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 1rem;
    }
    .field {
      display: grid;
      gap: 0.35rem;
    }
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
