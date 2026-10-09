import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  GOAL_METRICS,
  GoalDefinitionSchema,
  type ActionConfig,
  type Goal,
  type GoalDefinition,
} from '@tiklive/contracts';
import { LucideCircleAlert } from '@lucide/angular';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UiFormField } from '../../components/ui/form-field';
import { UiInput, UiNativeSelect } from '../../components/ui/input';
import { UiSwitch } from '../../components/ui/switch';
import { AssetsStore } from '../../core/assets.store';
import { GOAL_METRIC_LABELS } from '../../lib/labels';

/** Celebration presets: sound + alert + speech. Other onReach actions are kept as they are. */
function splitActions(actions: readonly ActionConfig[]) {
  const sound = actions.find((a) => a.type === 'playSound');
  const alert = actions.find((a) => a.type === 'showAlert');
  const speak = actions.find((a) => a.type === 'speak');
  const rest = actions.filter((a) => a !== sound && a !== alert && a !== speak);
  return { sound, alert, speak, rest };
}

/** Create or edit a goal (RF-15) with a simple celebration made of sound, alert and voice. */
@Component({
  selector: 'app-goal-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiButton,
    UiInput,
    UiNativeSelect,
    UiFormField,
    UiSwitch,
    ...UI_ALERT,
    LucideCircleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="grid gap-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <ui-form-field label="Nombre" for="g-name">
        <input uiInput id="g-name" type="text" formControlName="name" />
      </ui-form-field>
      <div class="grid grid-cols-2 gap-4">
        <ui-form-field label="Cuenta" for="g-metric">
          <select uiNativeSelect id="g-metric" formControlName="metric">
            @for (m of metrics; track m) {
              <option [value]="m">{{ metricLabels[m] }}</option>
            }
          </select>
        </ui-form-field>
        <ui-form-field label="Objetivo" for="g-target">
          <input uiInput id="g-target" type="number" min="1" formControlName="target" />
        </ui-form-field>
        <ui-form-field label="Período" for="g-scope">
          <select uiNativeSelect id="g-scope" formControlName="scope">
            <option value="session">Cada live</option>
            <option value="total">Acumulado histórico</option>
          </select>
        </ui-form-field>
        <ui-form-field label="Al cumplirse" for="g-repeat">
          <select uiNativeSelect id="g-repeat" formControlName="repeat">
            <option value="">Termina</option>
            <option value="1.5">Siguiente nivel ×1,5</option>
            <option value="2">Siguiente nivel ×2</option>
            <option value="3">Siguiente nivel ×3</option>
          </select>
        </ui-form-field>
      </div>
      <fieldset class="m-0 grid gap-4 rounded-lg border p-4">
        <legend class="px-1 type-label">Celebración al cumplirla</legend>
        <ui-form-field label="Sonido" for="g-sound">
          <select uiNativeSelect id="g-sound" formControlName="soundId">
            <option value="">Sin sonido</option>
            @for (a of assets.sounds(); track a.id) {
              <option [value]="a.id">{{ a.originalName }}</option>
            }
          </select>
          @if (!assets.sounds().length) {
            <p uiFieldDescription class="type-caption">
              Sube sonidos en
              <a routerLink="/assets" class="font-medium text-primary hover:underline"
                >Sonidos e imágenes</a
              >.
            </p>
          }
        </ui-form-field>
        <ui-form-field label="Texto de la alerta" for="g-alert" description="Vacío = sin alerta.">
          <input
            uiInput
            id="g-alert"
            type="text"
            formControlName="alertText"
            aria-describedby="g-alert-description"
          />
        </ui-form-field>
        <ui-form-field
          label="Texto a leer en voz alta"
          for="g-speak"
          description="Vacío = sin voz."
        >
          <input
            uiInput
            id="g-speak"
            type="text"
            formControlName="speakText"
            aria-describedby="g-speak-description"
          />
        </ui-form-field>
        <p class="type-caption">
          Variables:
          <code class="rounded bg-muted px-1 py-0.5 text-[0.6875rem] text-foreground">{{
            '{goalName} {cycle} {current}'
          }}</code>
        </p>
      </fieldset>
      <div class="flex items-center gap-3">
        <ui-switch inputId="g-active" formControlName="active" />
        <label for="g-active" class="type-label">Meta activa</label>
      </div>
      @if (error()) {
        <div uiAlert variant="destructive" role="alert">
          <svg lucideCircleAlert />
          <p uiAlertTitle>Revisa la meta</p>
          <p uiAlertDescription>{{ error() }}</p>
        </div>
      }
      <div class="flex justify-end gap-2">
        <button uiButton variant="ghost" type="button" (click)="cancelled.emit()">Cancelar</button>
        <button uiButton type="submit">{{ goal() ? 'Guardar meta' : 'Crear meta' }}</button>
      </div>
    </form>
  `,
})
export class GoalForm {
  readonly goal = input<Goal | undefined>(undefined);
  readonly saved = output<GoalDefinition>();
  readonly cancelled = output();

  protected readonly assets = inject(AssetsStore);
  protected readonly metrics = GOAL_METRICS;
  protected readonly metricLabels = GOAL_METRIC_LABELS;
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly form = new FormGroup({
    name: new FormControl('Meta de diamantes', { nonNullable: true }),
    metric: new FormControl<(typeof GOAL_METRICS)[number]>('diamonds', { nonNullable: true }),
    target: new FormControl(100, { nonNullable: true }),
    scope: new FormControl<'session' | 'total'>('session', { nonNullable: true }),
    repeat: new FormControl('', { nonNullable: true }),
    soundId: new FormControl('', { nonNullable: true }),
    alertText: new FormControl('¡{goalName} cumplida!', { nonNullable: true }),
    speakText: new FormControl('', { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    void this.assets.load();
    effect(() => {
      const goal = this.goal();
      if (goal) this.fill(goal);
    });
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    const rest = splitActions(this.goal()?.onReach ?? []).rest;
    const onReach: ActionConfig[] = [...rest];
    if (v.soundId)
      onReach.push({ type: 'playSound', screen: 'audio', assetId: Number(v.soundId), volume: 1 });
    if (v.alertText.trim()) {
      onReach.push({
        type: 'showAlert',
        screen: 'alerts',
        text: v.alertText.trim(),
        durationMs: 6000,
      });
    }
    if (v.speakText.trim())
      onReach.push({ type: 'speak', screen: 'audio', text: v.speakText.trim(), volume: 1 });
    const parsed = GoalDefinitionSchema.safeParse({
      name: v.name,
      metric: v.metric,
      target: v.target,
      scope: v.scope,
      repeatFactor: v.repeat ? Number(v.repeat) : null,
      active: v.active,
      onReach,
    });
    if (!parsed.success) {
      this.error.set(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
      return;
    }
    this.error.set(undefined);
    this.saved.emit(parsed.data);
  }

  private fill(goal: Goal): void {
    const { sound, alert, speak } = splitActions(goal.onReach);
    this.form.reset({
      name: goal.name,
      metric: goal.metric,
      target: goal.target,
      scope: goal.scope,
      repeat: goal.repeatFactor === null ? '' : String(goal.repeatFactor),
      soundId: sound?.type === 'playSound' ? String(sound.assetId) : '',
      alertText: alert?.type === 'showAlert' ? alert.text : '',
      speakText: speak?.type === 'speak' ? speak.text : '',
      active: goal.active,
    });
  }
}
