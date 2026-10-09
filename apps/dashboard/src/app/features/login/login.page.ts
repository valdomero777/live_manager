import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideKeyRound, LucideRadio } from '@lucide/angular';
import { MIN_PASSWORD_LENGTH } from '@tiklive/contracts';
import { ApiError } from '../../core/api-client';
import { AuthStore } from '../../core/auth.store';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiSpinner } from '../../components/ui/feedback';
import { UiFormField, describedBy } from '../../components/ui/form-field';
import { UiInput } from '../../components/ui/input';

/**
 * Sign-in, or first-time password creation with the one-time code printed in the server
 * console (nobody else on the LAN can claim the panel first).
 */
@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    UiButton,
    UiInput,
    UiFormField,
    UiSpinner,
    ...UI_CARD,
    ...UI_ALERT,
    LucideRadio,
    LucideKeyRound,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid min-h-dvh place-items-center bg-background p-4' },
  template: `
    <main class="grid w-full max-w-sm gap-6">
      <div class="grid justify-items-center gap-3 text-center">
        <span
          class="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-card"
          aria-hidden="true"
        >
          <svg lucideRadio class="size-6" />
        </span>
        <div class="grid gap-1">
          <h1 class="type-page-title">TikLive</h1>
          <p class="type-secondary">Automatización para tu TikTok LIVE</p>
        </div>
      </div>

      <form
        uiCard
        [formGroup]="form"
        (ngSubmit)="submit()"
        novalidate
        aria-labelledby="login-title"
      >
        <header uiCardHeader>
          <h2 uiCardTitle id="login-title">
            {{ setupRequired() ? 'Crea la contraseña del panel' : 'Inicia sesión' }}
          </h2>
          <p uiCardDescription>
            {{ setupRequired() ? 'Solo la primera vez.' : 'Con la contraseña del panel.' }}
          </p>
        </header>
        <div uiCardContent class="grid gap-4">
          @if (setupRequired()) {
            <div uiAlert variant="info">
              <svg lucideKeyRound />
              <p uiAlertDescription>
                Copia el <strong>código de configuración</strong> que aparece en la consola donde
                corre el servidor.
              </p>
            </div>
            <ui-form-field label="Código de configuración" for="code">
              <input
                uiInput
                id="code"
                type="text"
                formControlName="code"
                autocomplete="one-time-code"
                autocapitalize="characters"
                class="font-mono tracking-widest uppercase"
              />
            </ui-form-field>
          }
          <ui-form-field
            [label]="setupRequired() ? 'Nueva contraseña' : 'Contraseña'"
            for="password"
            [description]="setupRequired() ? 'Mínimo ' + minLength + ' caracteres.' : undefined"
            [error]="error()"
          >
            <input
              uiInput
              id="password"
              type="password"
              formControlName="password"
              [attr.autocomplete]="setupRequired() ? 'new-password' : 'current-password'"
              [attr.aria-invalid]="!!error()"
              [attr.aria-describedby]="
                describedBy('password', { description: setupRequired(), error: error() })
              "
            />
          </ui-form-field>
          <button uiButton type="submit" class="w-full" [disabled]="busy()">
            @if (busy()) {
              <ui-spinner />
            }
            {{ setupRequired() ? 'Crear contraseña y entrar' : 'Entrar' }}
          </button>
        </div>
      </form>
    </main>
  `,
})
export class LoginPage {
  /** Where to go after signing in (query param set by the guard). */
  readonly volver = input<string>();

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly describedBy = describedBy;
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
    const safe = target?.startsWith('/') && !target.startsWith('//') ? target : '/inicio';
    return this.router.navigateByUrl(safe);
  }
}
