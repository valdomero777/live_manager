import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MIN_PASSWORD_LENGTH } from '@tiklive/contracts';
import { ApiError } from '../../core/api-client';
import { AuthStore } from '../../core/auth.store';

/**
 * Sign-in, or first-time password creation with the one-time code printed in the server
 * console (nobody else on the LAN can claim the panel first).
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <form class="card stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>TikLive</h1>
        @if (setupRequired()) {
          <p class="notice info">
            Primer inicio: crea la contraseña del panel. Copia el
            <strong>código de configuración</strong> que aparece en la consola donde corre el
            servidor.
          </p>
          <div class="stack field">
            <label for="code">Código de configuración</label>
            <input
              id="code"
              type="text"
              formControlName="code"
              autocomplete="one-time-code"
              autocapitalize="characters"
            />
          </div>
        }
        <div class="stack field">
          <label for="password">{{ setupRequired() ? 'Nueva contraseña' : 'Contraseña' }}</label>
          <input
            id="password"
            type="password"
            formControlName="password"
            [attr.autocomplete]="setupRequired() ? 'new-password' : 'current-password'"
            aria-describedby="password-help"
          />
          @if (setupRequired()) {
            <small id="password-help" class="muted">Mínimo {{ minLength }} caracteres.</small>
          }
        </div>
        @if (error()) {
          <p class="notice danger" role="alert">{{ error() }}</p>
        }
        <button class="primary" type="submit" [disabled]="busy()">
          {{ setupRequired() ? 'Crear contraseña y entrar' : 'Entrar' }}
        </button>
      </form>
    </main>
  `,
  styles: `
    .wrap {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1rem;
    }
    form {
      width: min(26rem, 100%);
    }
    .field {
      gap: 0.35rem;
    }
  `,
})
export class LoginPage {
  /** Where to go after signing in (query param set by the guard). */
  readonly volver = input<string>();

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly setupRequired = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly form = new FormGroup({
    code: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    void this.auth.refresh().then(
      (status) => {
        if (status.authenticated) void this.goBack();
        this.setupRequired.set(status.setupRequired);
      },
      (e: unknown) => this.error.set(e instanceof Error ? e.message : String(e)),
    );
  }

  protected async submit(): Promise<void> {
    const { code, password } = this.form.getRawValue();
    if (this.setupRequired() && password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    this.busy.set(true);
    this.error.set(undefined);
    try {
      if (this.setupRequired()) await this.auth.setup(code, password);
      else await this.auth.login(password);
      await this.goBack();
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'No se pudo iniciar sesión');
      this.form.controls.password.reset();
    } finally {
      this.busy.set(false);
    }
  }

  private goBack(): Promise<boolean> {
    const target = this.volver();
    const safe = target?.startsWith('/') && !target.startsWith('//') ? target : '/estado';
    return this.router.navigateByUrl(safe);
  }
}
