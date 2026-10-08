import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  LIVE_EVENT_TYPES,
  type LiveEventType,
  type Sound,
  type Trigger,
  type TriggerDefinitionInput,
} from '@tiklive/contracts';
import { AudioService } from '../../core/audio.service';
import { TriggersStore } from '../../core/triggers.store';
import { EVENT_LABELS, errorMessage } from '../../shared/labels';
import { SoundPicker } from './sound-picker';

/** What the form edits; becomes a TriggerDefinition on save. */
interface Draft {
  id: number | undefined;
  name: string;
  event: LiveEventType;
  sound: Pick<Sound, 'id' | 'title' | 'audioUrl' | 'pageUrl' | 'source'> | undefined;
  volume: number;
  enabled: boolean;
}

const blankDraft = (): Draft => ({
  id: undefined,
  name: '',
  event: 'follow',
  sound: undefined,
  volume: 0.8,
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
    enabled: t.enabled,
  };
}

/** Sound triggers: pick a MyInstants sound for a live event, set its volume, save, test. */
@Component({
  selector: 'app-triggers-page',
  imports: [SoundPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <h1>Triggers de sonido</h1>
      <span class="spacer"></span>
      @if (!draft()) {
        <button type="button" class="primary" (click)="startNew()">Nuevo trigger</button>
      }
    </div>
    <p class="muted">
      Cada trigger reproduce un sonido de MyInstants cuando ocurre un tipo de evento. El sonido se
      reproduce en la pantalla de audio (la fuente de navegador de OBS) directamente desde
      MyInstants: no se descarga ni se guarda en el servidor. Para reglas con condiciones usa
      «Reglas».
    </p>
    @if (message(); as m) {
      <p class="notice" [class.ok]="m.ok" [class.danger]="!m.ok" role="status">{{ m.text }}</p>
    }
    @if (audio.blocked()) {
      <p class="notice warn" role="alert">
        Activa el audio para permitir la reproducción automática de triggers.
        <button type="button" (click)="audio.unlock()">Activar audio</button>
      </p>
    }

    @if (draft(); as d) {
      <form class="card stack" (submit)="$event.preventDefault(); save()" aria-label="Trigger">
        <h2>{{ d.id === undefined ? 'Nuevo trigger' : 'Editar trigger' }}</h2>
        <div class="stack">
          <label for="t-name">Nombre</label>
          <input
            id="t-name"
            type="text"
            maxlength="100"
            [value]="d.name"
            (input)="patch({ name: $any($event.target).value })"
            placeholder="Nuevo seguidor"
          />
        </div>
        <div class="stack">
          <label for="t-event">Evento</label>
          <select id="t-event" (change)="patch({ event: $any($event.target).value })">
            @for (e of events; track e) {
              <option [value]="e" [selected]="e === d.event">{{ labels[e] }}</option>
            }
          </select>
        </div>

        <div class="stack">
          <strong>Sonido</strong>
          @if (d.sound; as s) {
            <div class="card selected-sound">
              <div class="muted small">Sonido seleccionado</div>
              <div class="sound-title">{{ s.title }}</div>
              <div class="row">
                <button type="button" (click)="toggleTest(s.audioUrl, d.volume)">
                  {{ audio.playingUrl() === s.audioUrl ? '■ Detener' : '▶ Probar' }}
                </button>
                <button type="button" (click)="pickerOpen.set(!pickerOpen())">
                  {{ pickerOpen() ? 'Cerrar búsqueda' : 'Cambiar' }}
                </button>
              </div>
              <div class="muted small">Fuente: MyInstants</div>
            </div>
          } @else {
            <p class="muted">Aún no eliges un sonido.</p>
          }
          @if (pickerOpen() || !d.sound) {
            <app-sound-picker [selectedId]="d.sound?.id" (picked)="pick($event)" />
          }
        </div>

        <div class="stack">
          <label for="t-vol">Volumen: {{ percent(d.volume) }}%</label>
          <input
            id="t-vol"
            type="range"
            min="0"
            max="1"
            step="0.05"
            [value]="d.volume"
            (input)="setVolume($any($event.target).valueAsNumber)"
          />
        </div>
        <label class="check">
          <input
            type="checkbox"
            [checked]="d.enabled"
            (change)="patch({ enabled: $any($event.target).checked })"
          />
          Activado
        </label>
        <div class="row">
          <button type="submit" class="primary" [disabled]="busy() || !canSave()">Guardar</button>
          <button type="button" (click)="cancel()">Cancelar</button>
        </div>
      </form>
    }

    <div class="stack">
      @for (t of store.triggers(); track t.id) {
        <article class="card trigger" [class.off]="!t.enabled">
          <div class="head">
            <label class="switch">
              <input
                type="checkbox"
                [checked]="t.enabled"
                [disabled]="busy()"
                (change)="toggle(t, $any($event.target).checked)"
                [attr.aria-label]="'Activar ' + t.name"
              />
              <span>{{ t.enabled ? 'Activo' : 'Inactivo' }}</span>
            </label>
            <h2>{{ t.name }}</h2>
            <span class="badge">{{ labels[t.event] }}</span>
            <span class="badge">{{ percent(t.volume) }}%</span>
          </div>
          <div>🔊 {{ t.soundTitle }} <span class="muted small">· MyInstants</span></div>
          <div class="row">
            <button type="button" (click)="toggleTest(t.soundUrl, t.volume)">
              {{ audio.playingUrl() === t.soundUrl ? '■ Detener' : '▶ Probar' }}
            </button>
            <button type="button" (click)="testOnScreen(t)" [disabled]="busy()">
              Probar en la pantalla de audio
            </button>
            <button type="button" (click)="edit(t)" [disabled]="busy()">Editar</button>
            <button type="button" class="danger" (click)="remove(t)" [disabled]="busy()">
              Eliminar
            </button>
          </div>
        </article>
      } @empty {
        <p class="card muted">Aún no hay triggers. Crea el primero con «Nuevo trigger».</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 1rem;
    }
    .spacer {
      flex: 1;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
    }
    .head h2 {
      margin: 0;
    }
    .trigger {
      display: grid;
      gap: 0.6rem;
    }
    .trigger.off {
      opacity: 0.7;
    }
    .switch,
    .check {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 500;
    }
    .sound-title {
      font-weight: 700;
      font-size: 1.05rem;
    }
    input[type='range'] {
      width: 100%;
      accent-color: var(--accent);
    }
  `,
})
export class TriggersPage {
  protected readonly store = inject(TriggersStore);
  protected readonly audio = inject(AudioService);
  protected readonly events = LIVE_EVENT_TYPES;
  protected readonly labels = EVENT_LABELS;

  protected readonly draft = signal<Draft | undefined>(undefined);
  protected readonly pickerOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | undefined>(undefined);
  protected readonly canSave = computed(() => {
    const d = this.draft();
    return !!d && d.name.trim().length > 0 && d.sound !== undefined;
  });

  constructor() {
    void this.run(() => this.store.load());
  }

  protected percent(volume: number): number {
    return Math.round(volume * 100);
  }

  protected startNew(): void {
    this.audio.stopSound();
    this.message.set(undefined);
    this.pickerOpen.set(false);
    this.draft.set(blankDraft());
  }

  protected edit(trigger: Trigger): void {
    this.audio.stopSound();
    this.message.set(undefined);
    this.pickerOpen.set(false);
    this.draft.set(draftOf(trigger));
  }

  protected cancel(): void {
    this.audio.stopSound();
    this.draft.set(undefined);
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  protected pick(sound: Sound): void {
    this.patch({ sound });
    this.pickerOpen.set(false);
  }

  protected setVolume(volume: number): void {
    this.patch({ volume });
    this.audio.setVolume(volume); // a sound that is playing follows the slider
  }

  /** Plays or stops locally with the configured volume; changes nothing on the server. */
  protected toggleTest(url: string, volume: number): void {
    if (this.audio.playingUrl() === url) this.audio.stopSound();
    else void this.audio.playSound(url, volume);
  }

  protected save(): Promise<void> {
    const d = this.draft();
    if (!d?.sound) return Promise.resolve();
    const definition: TriggerDefinitionInput = {
      name: d.name.trim(),
      event: d.event,
      soundId: d.sound.id,
      soundTitle: d.sound.title,
      soundUrl: d.sound.audioUrl,
      soundPageUrl: d.sound.pageUrl,
      source: d.sound.source,
      volume: d.volume,
      enabled: d.enabled,
    };
    return this.run(async () => {
      await this.store.save(d.id, definition);
      this.audio.stopSound();
      this.draft.set(undefined);
      this.message.set({ ok: true, text: 'Trigger guardado.' });
    });
  }

  protected toggle(trigger: Trigger, enabled: boolean): Promise<void> {
    return this.run(() => this.store.setEnabled(trigger, enabled));
  }

  protected remove(trigger: Trigger): Promise<void> {
    if (!confirm(`¿Eliminar el trigger «${trigger.name}»?`)) return Promise.resolve();
    return this.run(() => this.store.delete(trigger.id));
  }

  protected testOnScreen(trigger: Trigger): Promise<void> {
    return this.run(async () => {
      const { status } = await this.store.testOnAudioScreen(trigger.id);
      this.message.set(
        status === 'queued'
          ? { ok: true, text: 'Enviado a la pantalla de audio.' }
          : { ok: false, text: 'No se pudo enviar el sonido.' },
      );
    });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      this.message.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.busy.set(false);
    }
  }
}
