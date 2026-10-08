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
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="grid">
        <div class="field wide">
          <label for="g-name">Nombre</label>
          <input id="g-name" type="text" formControlName="name" />
        </div>
        <div class="field">
          <label for="g-metric">Cuenta</label>
          <select id="g-metric" formControlName="metric">
            @for (m of metrics; track m) {
              <option [value]="m">{{ metricLabels[m] }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="g-target">Objetivo</label>
          <input id="g-target" type="number" min="1" formControlName="target" />
        </div>
        <div class="field">
          <label for="g-scope">Período</label>
          <select id="g-scope" formControlName="scope">
            <option value="session">Cada live</option>
            <option value="total">Acumulado histórico</option>
          </select>
        </div>
        <div class="field">
          <label for="g-repeat">Al cumplirse</label>
          <select id="g-repeat" formControlName="repeat">
            <option value="">Termina</option>
            <option value="1.5">Siguiente nivel ×1,5</option>
            <option value="2">Siguiente nivel ×2</option>
            <option value="3">Siguiente nivel ×3</option>
          </select>
        </div>
      </div>
      <fieldset class="stack">
        <legend>Celebración al cumplirla</legend>
        <div class="grid">
          <div class="field">
            <label for="g-sound">Sonido</label>
            <select id="g-sound" formControlName="soundId">
              <option value="">Sin sonido</option>
              @for (a of assets.sounds(); track a.id) {
                <option [value]="a.id">{{ a.originalName }}</option>
              }
            </select>
            @if (!assets.sounds().length) {
              <small class="muted"
                >Sube sonidos en <a routerLink="/assets">Sonidos e imágenes</a>.</small
              >
            }
          </div>
          <div class="field wide">
            <label for="g-alert">Texto de la alerta (vacío = sin alerta)</label>
            <input id="g-alert" type="text" formControlName="alertText" />
          </div>
          <div class="field wide">
            <label for="g-speak">Texto a leer en voz alta (vacío = sin voz)</label>
            <input id="g-speak" type="text" formControlName="speakText" />
          </div>
        </div>
        <small class="muted"
          >Variables: <code>{{ '{goalName} {cycle} {current}' }}</code></small
        >
      </fieldset>
      <label class="check"><input type="checkbox" formControlName="active" /> Meta activa</label>
      @if (error()) {
        <p class="notice danger" role="alert">{{ error() }}</p>
      }
      <div class="row">
        <button class="primary" type="submit">{{ goal() ? 'Guardar meta' : 'Crear meta' }}</button>
        <button type="button" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 0.85rem 1rem;
    }
    .field {
      display: grid;
      gap: 0.3rem;
      align-content: start;
    }
    .field.wide {
      grid-column: 1 / -1;
    }
    fieldset {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.85rem;
    }
    legend {
      font-weight: 600;
      padding: 0 0.35rem;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 500;
    }
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
