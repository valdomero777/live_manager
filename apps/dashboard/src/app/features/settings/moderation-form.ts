import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ModerationSettingsSchema, type ModerationSettings } from '@tiklive/contracts';
import { LucideCircleAlert, LucideCircleCheck } from '@lucide/angular';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiSpinner } from '../../components/ui/feedback';
import { UiFormField } from '../../components/ui/form-field';
import { UiInput, UiNativeSelect, UiTextarea } from '../../components/ui/input';
import { UiSwitch } from '../../components/ui/switch';
import { ApiClient, ApiError } from '../../core/api-client';

const PRONUNCIATION_SEPARATOR = '=';

/** "texto" lines -> list; empty lines ignored. */
function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function parsePronunciations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines(text)) {
    const [word, ...rest] = line.split(PRONUNCIATION_SEPARATOR);
    const spoken = rest.join(PRONUNCIATION_SEPARATOR).trim();
    if (word?.trim() && spoken) out[word.trim()] = spoken;
  }
  return out;
}

/** TTS moderation (RF-11): what gets read aloud and how. Applied at once when saved. */
@Component({
  selector: 'app-moderation-form',
  imports: [
    ReactiveFormsModule,
    UiButton,
    UiFormField,
    UiInput,
    UiNativeSelect,
    UiSpinner,
    UiSwitch,
    UiTextarea,
    ...UI_CARD,
    ...UI_ALERT,
    LucideCircleAlert,
    LucideCircleCheck,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form uiCard [formGroup]="form" (ngSubmit)="save()" aria-labelledby="mod-title" novalidate>
      <header uiCardHeader>
        <h2 uiCardTitle id="mod-title">Moderación de la voz (TTS)</h2>
        <p uiCardDescription>
          Filtros que pasa cada comentario antes de leerse en voz alta. Se aplican al instante.
        </p>
      </header>
      <div uiCardContent class="grid gap-5">
        <div class="form-grid">
          <ui-form-field label="Largo máximo (caracteres)" for="m-max">
            <input
              uiInput
              id="m-max"
              type="number"
              min="10"
              max="500"
              formControlName="maxLength"
            />
          </ui-form-field>
          <ui-form-field label="Lecturas por usuario por minuto" for="m-rate">
            <input
              uiInput
              id="m-rate"
              type="number"
              min="1"
              max="60"
              formControlName="maxPerUserPerMinute"
            />
          </ui-form-field>
          <ui-form-field label="Ignorar repetidos durante (s)" for="m-dup">
            <input
              uiInput
              id="m-dup"
              type="number"
              min="0"
              max="600"
              formControlName="duplicateWindowS"
            />
          </ui-form-field>
          <ui-form-field label="Palabras bloqueadas" for="m-mode">
            <select uiNativeSelect id="m-mode" formControlName="blockMode">
              <option value="drop">No leer el comentario</option>
              <option value="mask">Leerlo ocultando la palabra</option>
            </select>
          </ui-form-field>
        </div>
        <div class="flex flex-wrap gap-x-8 gap-y-3">
          <div class="flex items-center gap-3">
            <ui-switch inputId="m-emoji" formControlName="stripEmojis" />
            <label for="m-emoji" class="type-label">Quitar emojis</label>
          </div>
          <div class="flex items-center gap-3">
            <ui-switch inputId="m-mentions" formControlName="readMentions" />
            <label for="m-mentions" class="type-label">Leer &#64;menciones</label>
          </div>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <ui-form-field
            label="Lista de bloqueo"
            for="m-block"
            description="Una palabra o frase por línea."
          >
            <textarea
              uiTextarea
              id="m-block"
              class="font-mono"
              formControlName="blockedTerms"
              aria-describedby="m-block-description"
            ></textarea>
          </ui-form-field>
          <ui-form-field
            label="Diccionario de pronunciación"
            for="m-pron"
            description="Una por línea: GG = buena partida"
          >
            <textarea
              uiTextarea
              id="m-pron"
              class="font-mono"
              formControlName="pronunciations"
              aria-describedby="m-pron-description"
            ></textarea>
          </ui-form-field>
        </div>
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
      <footer uiCardFooter class="justify-end border-t border-border-subtle pt-4">
        <button uiButton type="submit" [disabled]="busy()">
          @if (busy()) {
            <ui-spinner />
          }
          Guardar moderación
        </button>
      </footer>
    </form>
  `,
})
export class ModerationForm {
  private readonly api = inject(ApiClient);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | undefined>(undefined);
  protected readonly form = new FormGroup({
    maxLength: new FormControl(150, { nonNullable: true }),
    maxPerUserPerMinute: new FormControl(3, { nonNullable: true }),
    duplicateWindowS: new FormControl(30, { nonNullable: true }),
    blockMode: new FormControl<'drop' | 'mask'>('drop', { nonNullable: true }),
    stripEmojis: new FormControl(true, { nonNullable: true }),
    readMentions: new FormControl(false, { nonNullable: true }),
    blockedTerms: new FormControl('', { nonNullable: true }),
    pronunciations: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    void this.api.get<ModerationSettings>('/settings/moderation').then((s) => this.fill(s));
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const candidate = ModerationSettingsSchema.safeParse({
      maxLength: v.maxLength,
      maxPerUserPerMinute: v.maxPerUserPerMinute,
      duplicateWindowMs: v.duplicateWindowS * 1000,
      blockMode: v.blockMode,
      stripEmojis: v.stripEmojis,
      readMentions: v.readMentions,
      blockedTerms: lines(v.blockedTerms),
      pronunciations: parsePronunciations(v.pronunciations),
    });
    if (!candidate.success) {
      this.message.set({
        ok: false,
        text: `Revisa los valores: ${candidate.error.issues[0]?.message ?? ''}`,
      });
      return;
    }
    this.busy.set(true);
    try {
      this.fill(await this.api.put<ModerationSettings>('/settings/moderation', candidate.data));
      this.message.set({ ok: true, text: 'Moderación guardada y aplicada.' });
    } catch (e) {
      this.message.set({ ok: false, text: e instanceof ApiError ? e.message : String(e) });
    } finally {
      this.busy.set(false);
    }
  }

  private fill(s: ModerationSettings): void {
    this.form.reset({
      maxLength: s.maxLength,
      maxPerUserPerMinute: s.maxPerUserPerMinute,
      duplicateWindowS: Math.round(s.duplicateWindowMs / 1000),
      blockMode: s.blockMode,
      stripEmojis: s.stripEmojis,
      readMentions: s.readMentions,
      blockedTerms: s.blockedTerms.join('\n'),
      pronunciations: Object.entries(s.pronunciations)
        .map(([word, spoken]) => `${word} ${PRONUNCIATION_SEPARATOR} ${spoken}`)
        .join('\n'),
    });
  }
}
