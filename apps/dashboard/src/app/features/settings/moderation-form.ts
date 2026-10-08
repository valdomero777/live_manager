import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ModerationSettingsSchema, type ModerationSettings } from '@tiklive/contracts';
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
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="card stack"
      [formGroup]="form"
      (ngSubmit)="save()"
      aria-labelledby="mod-title"
      novalidate
    >
      <div>
        <h2 id="mod-title">Moderación de la voz (TTS)</h2>
        <p class="muted">
          Filtros que pasa cada comentario antes de leerse en voz alta. Se aplican al instante.
        </p>
      </div>
      <div class="grid">
        <div class="field">
          <label for="m-max">Largo máximo (caracteres)</label>
          <input id="m-max" type="number" min="10" max="500" formControlName="maxLength" />
        </div>
        <div class="field">
          <label for="m-rate">Lecturas por usuario por minuto</label>
          <input id="m-rate" type="number" min="1" max="60" formControlName="maxPerUserPerMinute" />
        </div>
        <div class="field">
          <label for="m-dup">Ignorar repetidos durante (segundos)</label>
          <input id="m-dup" type="number" min="0" max="600" formControlName="duplicateWindowS" />
        </div>
        <div class="field">
          <label for="m-mode">Palabras bloqueadas</label>
          <select id="m-mode" formControlName="blockMode">
            <option value="drop">No leer el comentario</option>
            <option value="mask">Leerlo ocultando la palabra</option>
          </select>
        </div>
      </div>
      <div class="row">
        <label class="check"
          ><input type="checkbox" formControlName="stripEmojis" /> Quitar emojis</label
        >
        <label class="check"
          ><input type="checkbox" formControlName="readMentions" /> Leer &#64;menciones</label
        >
      </div>
      <div class="field">
        <label for="m-block">Lista de bloqueo</label>
        <textarea
          id="m-block"
          formControlName="blockedTerms"
          aria-describedby="m-block-help"
        ></textarea>
        <small id="m-block-help" class="muted">Una palabra o frase por línea.</small>
      </div>
      <div class="field">
        <label for="m-pron">Diccionario de pronunciación</label>
        <textarea
          id="m-pron"
          formControlName="pronunciations"
          aria-describedby="m-pron-help"
        ></textarea>
        <small id="m-pron-help" class="muted">Una por línea: <code>GG = buena partida</code></small>
      </div>
      @if (message(); as m) {
        <p class="notice" [class.ok]="m.ok" [class.danger]="!m.ok" role="status">{{ m.text }}</p>
      }
      <div class="row">
        <button class="primary" type="submit" [disabled]="busy()">Guardar moderación</button>
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
    .check {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-right: 1rem;
    }
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
