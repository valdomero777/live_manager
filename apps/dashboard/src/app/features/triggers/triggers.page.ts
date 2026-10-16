import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  LucideCircleAlert,
  LucideEllipsis,
  LucideMonitorPlay,
  LucidePencil,
  LucidePlus,
  LucideRadio,
  LucideSlidersHorizontal,
  LucideTrash,
  LucideVolume2,
  LucideVolumeX,
  LucideZap,
} from '@lucide/angular';
import {
  MAX_COOLDOWN_MS,
  MAX_SOUND_MS,
  SOUND_ORIGIN_LABELS,
  type LiveEventType,
  type Trigger,
  type TriggerDefinitionInput,
} from '@tiklive/contracts';
import {
  AutomationCard,
  type AutomationActionView,
} from '../../components/automations/automation-card';
import { AutomationStep } from '../../components/automations/automation-step';
import { TriggerSelector } from '../../components/automations/trigger-selector';
import { EmptyState } from '../../components/shared/empty-state';
import { PageHeader } from '../../components/shared/page-header';
import { SoundPlayer } from '../../components/sounds/sound-player';
import { SoundPreview } from '../../components/sounds/sound-preview';
import type { PickedSound } from '../../components/sounds/picked-sound';
import { SoundSelector } from '../../components/sounds/sound-selector';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { ConfirmService } from '../../components/ui/confirm-dialog';
import { UI_DROPDOWN_MENU } from '../../components/ui/dropdown-menu';
import { UiSkeleton, UiSpinner } from '../../components/ui/feedback';
import { UiFormField, describedBy } from '../../components/ui/form-field';
import { UiInput } from '../../components/ui/input';
import { UiSwitch } from '../../components/ui/switch';
import { ToastService } from '../../components/ui/toast';
import { AudioService } from '../../core/audio.service';
import { TriggersStore } from '../../core/triggers.store';
import { errorMessage } from '../../lib/labels';
import { moreActionsLabel } from '../../lib/accessible-labels';

/** What the form edits; becomes a TriggerDefinition on save. */
interface Draft {
  id: number | undefined;
  name: string;
  event: LiveEventType;
  sound: PickedSound | undefined;
  volume: number;
  /** Seconds to cut the sound at; empty plays it in full. */
  maxS: string;
  cooldownS: string;
  probabilityPct: string;
  enabled: boolean;
}

const blankDraft = (): Draft => ({
  id: undefined,
  name: '',
  event: 'follow',
  sound: undefined,
  volume: 0.8,
  maxS: '',
  cooldownS: '0',
  probabilityPct: '100',
  enabled: true,
});

function draftOf(t: Trigger): Draft {
  const { soundId, soundTitle, soundUrl, soundPageUrl, source } = t;
  return {
    id: t.id,
    name: t.name,
    event: t.event,
    sound: { id: soundId, title: soundTitle, audioUrl: soundUrl, pageUrl: soundPageUrl, source },
    volume: t.volume,
    maxS: t.maxMs === undefined ? '' : String(t.maxMs / 1000),
    cooldownS: String(t.cooldownMs / 1000),
    probabilityPct: String(percent(t.probability)),
    enabled: t.enabled,
  };
}

function percent(volume: number): number {
  return Math.round(volume * 100);
}

/** A number typed in a field, or undefined when empty or not a number. */
function numberOf(raw: string): number | undefined {
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Longest value each timing field accepts, in seconds. */
const MAX_SECONDS = { cut: MAX_SOUND_MS / 1000, cooldown: MAX_COOLDOWN_MS / 1000 } as const;

/** Sound triggers: WHEN a LIVE event happens, THEN play a remote sound at a set volume. */
@Component({
  selector: 'app-triggers-page',
  imports: [
    PageHeader,
    AutomationCard,
    AutomationStep,
    TriggerSelector,
    SoundSelector,
    SoundPlayer,
    SoundPreview,
    EmptyState,
    UiButton,
    UiFormField,
    UiInput,
    UiSwitch,
    UiSkeleton,
    UiSpinner,
    ...UI_CARD,
    ...UI_ALERT,
    ...UI_DROPDOWN_MENU,
    LucidePlus,
    LucidePencil,
    LucideTrash,
    LucideEllipsis,
    LucideMonitorPlay,
    LucideCircleAlert,
    LucideVolumeX,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  templateUrl: './triggers.page.html',
})
export class TriggersPage {
  protected readonly moreActionsLabel = moreActionsLabel;
  protected readonly store = inject(TriggersStore);
  protected readonly audio = inject(AudioService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly icons = { when: LucideRadio, then: LucideZap, empty: LucideVolume2 };
  protected readonly percent = percent;
  protected readonly sourceLabels = SOUND_ORIGIN_LABELS;
  protected readonly maxSeconds = MAX_SECONDS;
  protected readonly describedBy = describedBy;

  protected readonly draft = signal<Draft | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly nameError = computed(() =>
    this.showErrors() && !this.draft()?.name.trim()
      ? $localize`Ponle un nombre al trigger.`
      : undefined,
  );
  protected readonly soundError = computed(() =>
    this.showErrors() && !this.draft()?.sound ? $localize`Elige un sonido.` : undefined,
  );
  protected readonly maxError = computed(() => {
    const raw = this.draft()?.maxS ?? '';
    if (raw.trim() === '') return undefined;
    const value = numberOf(raw);
    return value === undefined || value <= 0 || value > MAX_SECONDS.cut
      ? $localize`Escribe entre 0.1 y ${MAX_SECONDS.cut} segundos, o déjalo vacío.`
      : undefined;
  });
  protected readonly cooldownError = computed(() => {
    const value = numberOf(this.draft()?.cooldownS ?? '');
    return value === undefined || value < 0 || value > MAX_SECONDS.cooldown
      ? $localize`Escribe entre 0 y ${MAX_SECONDS.cooldown} segundos.`
      : undefined;
  });
  protected readonly probabilityError = computed(() => {
    const value = numberOf(this.draft()?.probabilityPct ?? '');
    return value === undefined || value < 0 || value > 100
      ? $localize`Escribe un porcentaje entre 0 y 100.`
      : undefined;
  });
  protected readonly cards = computed(() =>
    this.store.triggers().map((t) => ({
      trigger: t,
      actions: [
        {
          icon: LucideVolume2,
          tone: 'bg-sound-soft text-sound-text',
          text: $localize`${t.soundTitle} · volumen ${percent(t.volume)}%`,
        },
        ...this.paramNotes(t).map((text) => ({
          icon: LucideSlidersHorizontal,
          tone: 'bg-surface-active text-muted-foreground',
          text,
        })),
      ] satisfies AutomationActionView[],
    })),
  );

  constructor() {
    void this.run(() => this.store.load()).finally(() => this.loading.set(false));
  }

  protected startNew(): void {
    this.open(blankDraft());
  }

  protected edit(trigger: Trigger): void {
    this.open(draftOf(trigger));
  }

  protected cancel(): void {
    this.audio.stopSound();
    this.draft.set(undefined);
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  /** Only the parameters that differ from the defaults, so a plain trigger stays one line. */
  private paramNotes(t: Trigger): string[] {
    const notes: string[] = [];
    if (t.maxMs !== undefined) notes.push($localize`Corta a los ${t.maxMs / 1000} s`);
    if (t.cooldownMs > 0) notes.push($localize`Espera ${t.cooldownMs / 1000} s entre sonidos`);
    if (t.probability < 1)
      notes.push($localize`Suena en el ${percent(t.probability)}% de los eventos`);
    return notes;
  }

  protected pick(sound: PickedSound): void {
    this.patch({ sound, name: this.draft()?.name || sound.title });
  }

  protected save(): Promise<void> {
    this.showErrors.set(true);
    const d = this.draft();
    if (!d?.sound || !d.name.trim()) return Promise.resolve();
    if (this.maxError() || this.cooldownError() || this.probabilityError())
      return Promise.resolve();
    const definition: TriggerDefinitionInput = {
      name: d.name.trim(),
      event: d.event,
      soundId: d.sound.id,
      soundTitle: d.sound.title,
      soundUrl: d.sound.audioUrl,
      soundPageUrl: d.sound.pageUrl,
      source: d.sound.source,
      volume: d.volume,
      ...(numberOf(d.maxS) === undefined ? {} : { maxMs: Math.round(Number(d.maxS) * 1000) }),
      cooldownMs: Math.round(Number(d.cooldownS) * 1000),
      probability: Number(d.probabilityPct) / 100,
      enabled: d.enabled,
    };
    return this.run(async () => {
      await this.store.save(d.id, definition);
      this.audio.stopSound();
      this.draft.set(undefined);
      this.toast.success(
        $localize`Trigger guardado`,
        $localize`«${definition.name}» ya reacciona al LIVE.`,
      );
    });
  }

  protected toggle(trigger: Trigger, enabled: boolean): Promise<void> {
    return this.run(() => this.store.setEnabled(trigger, enabled));
  }

  protected async remove(trigger: Trigger): Promise<void> {
    if (this.busy()) return;
    const ok = await this.confirm.confirm({
      title: $localize`¿Eliminar el trigger «${trigger.name}»?`,
      description: $localize`El sonido dejará de reproducirse con este evento.`,
      confirmLabel: $localize`Eliminar`,
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.store.delete(trigger.id);
      this.toast.success($localize`Trigger eliminado`);
    });
  }

  protected testOnScreen(trigger: Trigger): Promise<void> {
    return this.run(async () => {
      const { status } = await this.store.testOnAudioScreen(trigger.id);
      if (status === 'queued') this.toast.success($localize`Enviado a la pantalla de audio`);
      else
        this.toast.error(
          $localize`No se pudo enviar el sonido`,
          $localize`Revisa que la pantalla de audio esté abierta.`,
        );
    });
  }

  private open(draft: Draft): void {
    this.audio.stopSound();
    this.error.set(undefined);
    this.showErrors.set(false);
    this.draft.set(draft);
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await action();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
