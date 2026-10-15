import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  GoalRequestSchema,
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
import { GiftsStore } from '../../core/gifts.store';
import { GOAL_METRIC_LABELS } from '../../lib/labels';

/** Celebration presets: sound + alert + speech. Other onReach actions are kept as they are. */
function splitActions(actions: readonly ActionConfig[]) {
  const sound = actions.find((a) => a.type === 'playSound');
  const alert = actions.find((a) => a.type === 'showAlert');
  const speak = actions.find((a) => a.type === 'speak');
  const rest = actions.filter((a) => a !== sound && a !== alert && a !== speak);
  return { sound, alert, speak, rest };
}

interface CelebrationFields {
  readonly soundId: string;
  readonly alertText: string;
  readonly speakText: string;
}

/** The kept actions plus the sound, alert and voice typed in the form. */
function celebration(v: CelebrationFields, rest: readonly ActionConfig[]): ActionConfig[] {
  const onReach: ActionConfig[] = [...rest];
  if (v.soundId) {
    onReach.push({ type: 'playSound', screen: 'audio', assetId: Number(v.soundId), volume: 1 });
  }
  const alert = v.alertText.trim();
  if (alert) onReach.push({ type: 'showAlert', screen: 'alerts', text: alert, durationMs: 6000 });
  const speech = v.speakText.trim();
  if (speech) onReach.push({ type: 'speak', screen: 'audio', text: speech, volume: 1 });
  return onReach;
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
      <ui-form-field i18n-label label="Nombre" for="g-name">
        <input uiInput id="g-name" type="text" formControlName="name" />
      </ui-form-field>
      <div class="grid grid-cols-2 gap-4">
        <ui-form-field i18n-label label="Cuenta" for="g-metric">
          <select uiNativeSelect id="g-metric" formControlName="metric">
            @for (m of metrics; track m) {
              <option [value]="m">{{ metricLabels[m] }}</option>
            }
          </select>
        </ui-form-field>
        <ui-form-field i18n-label label="Objetivo" for="g-target">
          <input uiInput id="g-target" type="number" min="1" formControlName="target" />
        </ui-form-field>
        <ui-form-field
          class="col-span-2"
          i18n-description
          i18n-label
          label="Solo cuenta este regalo"
          for="g-gift"
          description="Desafío de regalos: ignora los demás. Cuenta desde que lo guardas, no recuenta regalos pasados. No sirve con likes."
        >
          <select
            uiNativeSelect
            id="g-gift"
            formControlName="giftId"
            aria-describedby="g-gift-description"
          >
            <option i18n value="">Todos los regalos</option>
            @if (savedGift(); as saved) {
              <option [value]="saved.id">{{ saved.name }}</option>
            }
            @for (g of gifts(); track g.id) {
              <option [value]="g.id">{{ g.name }} · {{ g.diamonds }}</option>
            }
          </select>
        </ui-form-field>
        <ui-form-field i18n-label label="Período" for="g-scope">
          <select uiNativeSelect id="g-scope" formControlName="scope">
            <option i18n value="session">Cada live</option>
            <option i18n value="total">Acumulado histórico</option>
          </select>
        </ui-form-field>
        <ui-form-field i18n-label label="Al cumplirse" for="g-repeat">
          <select uiNativeSelect id="g-repeat" formControlName="repeat">
            <option i18n value="">Termina</option>
            <option i18n value="1.5">Siguiente nivel ×1,5</option>
            <option i18n value="2">Siguiente nivel ×2</option>
            <option i18n value="3">Siguiente nivel ×3</option>
          </select>
        </ui-form-field>
      </div>
      <fieldset class="m-0 grid gap-4 rounded-lg border p-4">
        <legend i18n class="px-1 type-label">Celebración al cumplirla</legend>
        <ui-form-field i18n-label label="Sonido" for="g-sound">
          <select uiNativeSelect id="g-sound" formControlName="soundId">
            <option i18n value="">Sin sonido</option>
            @for (a of assets.sounds(); track a.id) {
              <option [value]="a.id">{{ a.originalName }}</option>
            }
          </select>
          @if (!assets.sounds().length) {
            <p i18n uiFieldDescription class="type-caption">
              Sube sonidos en
              <a routerLink="/assets" class="font-medium text-primary hover:underline"
                >Sonidos e imágenes</a
              >.
            </p>
          }
        </ui-form-field>
        <ui-form-field
          i18n-description
          i18n-label
          label="Texto de la alerta"
          for="g-alert"
          description="Vacío = sin alerta."
        >
          <input
            uiInput
            id="g-alert"
            type="text"
            formControlName="alertText"
            aria-describedby="g-alert-description"
          />
        </ui-form-field>
        <ui-form-field
          i18n-description
          i18n-label
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
        <p i18n class="type-caption">
          Variables:
          <code class="rounded bg-muted px-1 py-0.5 text-[0.6875rem] text-foreground">{{
            '{goalName} {cycle} {current}'
          }}</code>
        </p>
      </fieldset>
      <div class="flex items-center gap-3">
        <ui-switch inputId="g-active" formControlName="active" />
        <label i18n for="g-active" class="type-label">Meta activa</label>
      </div>
      @if (error()) {
        <div uiAlert variant="destructive" role="alert">
          <svg lucideCircleAlert />
          <p i18n uiAlertTitle>Revisa la meta</p>
          <p uiAlertDescription>{{ error() }}</p>
        </div>
      }
      <div class="flex justify-end gap-2">
        <button i18n uiButton variant="ghost" type="button" (click)="cancelled.emit()">
          Cancelar
        </button>
        <button uiButton type="submit">
          @if (goal()) {
            <ng-container i18n>Guardar meta</ng-container>
          } @else {
            <ng-container i18n>Crear meta</ng-container>
          }
        </button>
      </div>
    </form>
  `,
})
export class GoalForm {
  readonly goal = input<Goal | undefined>(undefined);
  readonly saved = output<GoalDefinition>();
  readonly cancelled = output();

  protected readonly assets = inject(AssetsStore);
  private readonly giftStore = inject(GiftsStore);
  protected readonly gifts = computed(() => this.giftStore.catalog()?.gifts ?? []);
  /** The goal's own gift stays selectable when the catalog is unavailable or lacks it. */
  protected readonly savedGift = computed(() => {
    const goal = this.goal();
    const known = this.gifts().some((g) => g.id === goal?.giftId);
    return goal?.giftId != null && !known
      ? { id: goal.giftId, name: goal.giftName ?? `#${goal.giftId}` }
      : undefined;
  });
  protected readonly metrics = GOAL_METRICS;
  protected readonly metricLabels = GOAL_METRIC_LABELS;
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly form = new FormGroup({
    name: new FormControl($localize`Meta de diamantes`, { nonNullable: true }),
    metric: new FormControl<(typeof GOAL_METRICS)[number]>('diamonds', { nonNullable: true }),
    target: new FormControl(100, { nonNullable: true }),
    scope: new FormControl<'session' | 'total'>('session', { nonNullable: true }),
    repeat: new FormControl('', { nonNullable: true }),
    soundId: new FormControl('', { nonNullable: true }),
    alertText: new FormControl('¡{goalName} cumplida!', { nonNullable: true }),
    speakText: new FormControl('', { nonNullable: true }),
    giftId: new FormControl('', { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    void this.assets.load();
    void this.giftStore.load();
    effect(() => {
      const goal = this.goal();
      if (goal) this.fill(goal);
    });
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    const onReach = celebration(v, splitActions(this.goal()?.onReach ?? []).rest);
    const gift = this.selectedGift(v.giftId);
    const parsed = GoalRequestSchema.safeParse({
      name: v.name,
      metric: v.metric,
      target: v.target,
      scope: v.scope,
      repeatFactor: v.repeat ? Number(v.repeat) : null,
      giftId: gift?.id ?? null,
      giftName: gift?.name ?? null,
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

  private selectedGift(value: string): { id: number; name: string } | undefined {
    if (!value) return undefined;
    const id = Number(value);
    const found = this.gifts().find((g) => g.id === id);
    return { id, name: found?.name ?? this.goal()?.giftName ?? `#${id}` };
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
      giftId: goal.giftId === null ? '' : String(goal.giftId),
      active: goal.active,
    });
  }
}
