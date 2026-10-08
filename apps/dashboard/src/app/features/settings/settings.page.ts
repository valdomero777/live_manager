import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SETTING_KEYS, type SettingKey, type SettingView } from '@tiklive/contracts';
import { startWith } from 'rxjs';
import { ApiError } from '../../core/api-client';
import { ModerationForm } from './moderation-form';
import { PasswordForm } from './password-form';
import {
  APPLY_LABELS,
  SETTING_SECTIONS,
  sourceLabel,
  type FieldDefinition,
} from './setting-fields';
import { SettingsStore, validateField, type FieldValue } from './settings.store';

type SettingsForm = FormGroup<Record<SettingKey, FormControl<FieldValue>>>;

const LABELS = new Map(SETTING_SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, f.label]));

/**
 * Every setting that used to be an environment variable, editable here. Only changed fields are
 * sent; live ones apply at once, restart ones wait for "Reiniciar ahora".
 */
@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule, ModerationForm, PasswordForm],
  providers: [SettingsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.css',
})
export class SettingsPage {
  protected readonly store = inject(SettingsStore);
  protected readonly sections = SETTING_SECTIONS;
  protected readonly applyLabels = APPLY_LABELS;
  protected readonly sourceLabel = sourceLabel;

  protected readonly form: SettingsForm = new FormGroup(
    Object.fromEntries(
      SETTING_KEYS.map((k) => [k, new FormControl<FieldValue>('', { nonNullable: true })]),
    ) as Record<SettingKey, FormControl<FieldValue>>,
  );
  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
  );

  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly serverErrors = signal<Partial<Record<string, string>>>({});

  /** Fields whose value differs from what the server reports. */
  protected readonly changed = computed(() => {
    this.formValue();
    const view = this.store.view();
    if (!view) return [] as SettingKey[];
    return SETTING_KEYS.filter((k) => this.isChanged(k, view.fields[k]));
  });

  protected readonly pendingRestartLabels = computed(() => {
    const fields = this.store.view()?.fields ?? {};
    return SETTING_KEYS.filter((k) => fields[k]?.pendingRestart).map((k) => LABELS.get(k) ?? k);
  });

  protected readonly resultSummary = computed(() => {
    const result = this.store.lastResult();
    if (!result) return undefined;
    const label = (k: string) => LABELS.get(k as SettingKey) ?? k;
    return { applied: result.applied.map(label), restart: result.restartRequired.map(label) };
  });

  constructor() {
    void this.reload();
  }

  protected field(key: SettingKey): SettingView | undefined {
    return this.store.view()?.fields[key];
  }

  protected errorFor(def: FieldDefinition): string | undefined {
    const server = this.serverErrors()[def.key];
    if (server) return server;
    this.formValue();
    if (def.kind === 'secret' && this.form.controls[def.key].value === '') return undefined;
    if (!this.changed().includes(def.key)) return undefined;
    return validateField(def.key, this.form.controls[def.key].value);
  }

  protected async save(): Promise<void> {
    const keys = this.changed();
    if (keys.length === 0) return;
    const invalid = keys.find((k) => validateField(k, this.form.controls[k].value));
    if (invalid) {
      this.error.set(`Revisa el campo «${LABELS.get(invalid) ?? invalid}».`);
      return;
    }
    const patch = Object.fromEntries(keys.map((k) => [k, this.form.controls[k].value]));
    await this.run(() => this.store.save(patch));
  }

  /** Removes the panel value so the environment variable (or default) applies again. */
  protected async useEnvironment(key: SettingKey): Promise<void> {
    await this.run(() => this.store.save({ [key]: null }));
  }

  protected async rotateOverlayKey(): Promise<void> {
    const ok = confirm(
      'Se generará una clave nueva y las URLs actuales de los overlays dejarán de funcionar. ' +
        'Tendrás que pegar las nuevas URLs en LIVE Studio u OBS. ¿Continuar?',
    );
    if (ok) await this.run(() => this.store.rotateOverlayKey());
  }

  protected async restart(): Promise<void> {
    const ok = confirm(
      'El servidor se reiniciará (unos segundos). Los overlays y el conector se reconectan solos. ¿Continuar?',
    );
    if (!ok) return;
    await this.run(async () => {
      const outcome = await this.store.restart();
      if (outcome === 'reverted') {
        this.error.set(
          'El servidor no pudo arrancar con el puerto nuevo y volvió a la configuración anterior.',
        );
      }
    });
  }

  protected discard(): void {
    this.resetForm();
  }

  private async reload(): Promise<void> {
    await this.run(() => this.store.load());
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    this.serverErrors.set({});
    try {
      await action();
      this.resetForm();
    } catch (e) {
      if (e instanceof ApiError) {
        this.serverErrors.set(Object.fromEntries(e.fieldErrors.map((f) => [f.path, f.message])));
        this.error.set(e.message);
      } else {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private resetForm(): void {
    const fields = this.store.view()?.fields ?? {};
    const values = Object.fromEntries(
      SETTING_KEYS.map((k) => [k, fields[k]?.secret ? '' : (fields[k]?.value ?? '')]),
    );
    this.form.reset(values);
  }

  private isChanged(key: SettingKey, view: SettingView | undefined): boolean {
    const value = this.form.controls[key].value;
    if (!view) return false;
    if (view.secret) return value !== '';
    return value !== view.value;
  }
}
