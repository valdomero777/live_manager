import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  TtsSettingsSchema,
  type Scope,
  type TtsEngine,
  type TtsSettings,
  type TtsVoiceInfo,
  type VoiceGender,
} from '@tiklive/contracts';
import { LucideCircleAlert, LucideCircleCheck, LucidePlay } from '@lucide/angular';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { UI_CARD } from '../../components/ui/card';
import { UiSpinner } from '../../components/ui/feedback';
import { UiFormField } from '../../components/ui/form-field';
import { UiInput, UiNativeSelect, UiSlider, UiTextarea } from '../../components/ui/input';
import { UiSwitch } from '../../components/ui/switch';
import { ApiClient, ApiError } from '../../core/api-client';

type OtherScript = TtsSettings['language']['otherScript'];
type OtherLanguage = TtsSettings['language']['otherLanguage'];

/** Shown even before the Edge catalogue loads (or when it cannot load). */
const COMMON_LOCALES = [
  'es-MX',
  'es-US',
  'es-ES',
  'es-AR',
  'es-CO',
  'es-CL',
  'es-PE',
  'en-US',
  'en-GB',
  'pt-BR',
  'fr-FR',
  'it-IT',
  'de-DE',
];

const languageNames = new Intl.DisplayNames(['es'], { type: 'language' });

function localeLabel(locale: string): string {
  try {
    return `${languageNames.of(locale) ?? locale} (${locale})`;
  } catch {
    return locale;
  }
}

function lines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function primary(tag: string): string {
  return tag.split('-')[0]!.toLowerCase();
}

interface VoiceOption {
  readonly value: string;
  readonly label: string;
}

/** Voice, audience, format and language protection of the TTS. Applied at once when saved. */
@Component({
  selector: 'app-tts-form',
  imports: [
    ReactiveFormsModule,
    UiButton,
    UiFormField,
    UiInput,
    UiNativeSelect,
    UiSlider,
    UiSpinner,
    UiSwitch,
    UiTextarea,
    ...UI_CARD,
    ...UI_ALERT,
    LucideCircleAlert,
    LucideCircleCheck,
    LucidePlay,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form uiCard [formGroup]="form" (ngSubmit)="save()" aria-labelledby="tts-title" novalidate>
      <header uiCardHeader>
        <h2 uiCardTitle id="tts-title">Voz (TTS)</h2>
        <p uiCardDescription>
          Qué voz lee, a quién se le lee y qué pasa con los comentarios en otro idioma. Se aplica al
          instante a las reglas con acción «Hablar».
        </p>
      </header>

      <div uiCardContent class="grid gap-6">
        <fieldset class="grid gap-4">
          <legend class="type-overline mb-2">Voz</legend>
          <div class="form-grid">
            <ui-form-field label="Motor" for="t-engine" [description]="engineHint()">
              <select uiNativeSelect id="t-engine" formControlName="engine">
                <option value="edge">Microsoft Edge (voces neuronales)</option>
                <option value="browser">Navegador de la PC de stream</option>
              </select>
            </ui-form-field>
            <ui-form-field label="Idioma de la voz" for="t-lang">
              <select uiNativeSelect id="t-lang" formControlName="language">
                @for (l of locales(); track l) {
                  <option [value]="l">{{ label(l) }}</option>
                }
              </select>
            </ui-form-field>
            <ui-form-field label="Género" for="t-gender">
              <select uiNativeSelect id="t-gender" formControlName="gender">
                <option value="female">Mujer</option>
                <option value="male">Hombre</option>
                <option value="any">Cualquiera</option>
              </select>
            </ui-form-field>
            <ui-form-field label="Voz" for="t-voice" [description]="voiceHint()">
              <select uiNativeSelect id="t-voice" formControlName="voiceName">
                <option value="">Automática (según idioma y género)</option>
                @for (v of voiceOptions(); track v.value) {
                  <option [value]="v.value">{{ v.label }}</option>
                }
              </select>
            </ui-form-field>
            <ui-form-field label="Velocidad: {{ value().rate }}×" for="t-rate">
              <input
                uiSlider
                id="t-rate"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                formControlName="rate"
              />
            </ui-form-field>
            <ui-form-field label="Tono: {{ value().pitch }}" for="t-pitch">
              <input
                uiSlider
                id="t-pitch"
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                formControlName="pitch"
              />
            </ui-form-field>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <ui-form-field label="Texto de prueba" for="t-sample" class="min-w-64 flex-1">
              <input uiInput id="t-sample" [formControl]="sample" maxlength="200" />
            </ui-form-field>
            <button
              uiButton
              type="button"
              variant="outline"
              (click)="preview()"
              [disabled]="previewing()"
            >
              @if (previewing()) {
                <ui-spinner />
              } @else {
                <svg lucidePlay />
              }
              Probar voz
            </button>
          </div>
        </fieldset>

        <fieldset class="grid gap-4">
          <legend class="type-overline mb-2">¿A quién se le lee?</legend>
          <div class="flex items-center gap-3">
            <ui-switch inputId="t-everyone" formControlName="everyone" />
            <label for="t-everyone" class="type-label">Leer a todos</label>
          </div>
          @if (!value().everyone) {
            <p class="type-caption">Se lee a quien cumpla al menos uno de los grupos marcados.</p>
            <div class="flex flex-wrap gap-x-8 gap-y-3">
              <div class="flex items-center gap-3">
                <ui-switch inputId="t-followers" formControlName="followers" />
                <label for="t-followers" class="type-label">Seguidores</label>
              </div>
              <div class="flex items-center gap-3">
                <ui-switch inputId="t-superfans" formControlName="superfans" />
                <label for="t-superfans" class="type-label">Super fans (suscriptores)</label>
              </div>
              <div class="flex items-center gap-3">
                <ui-switch inputId="t-mods" formControlName="moderators" />
                <label for="t-mods" class="type-label">Moderadores</label>
              </div>
            </div>
            <div class="form-grid">
              <div class="grid gap-2">
                <div class="flex items-center gap-3">
                  <ui-switch inputId="t-fan" formControlName="fanClub" />
                  <label for="t-fan" class="type-label">Fan club</label>
                </div>
                <ui-form-field label="Nivel mínimo del fan club" for="t-fan-min">
                  <input
                    uiInput
                    id="t-fan-min"
                    type="number"
                    min="1"
                    max="50"
                    formControlName="fanClubMin"
                  />
                </ui-form-field>
              </div>
              <div class="grid gap-2">
                <div class="flex items-center gap-3">
                  <ui-switch inputId="t-global" formControlName="globalGifters" />
                  <label for="t-global" class="type-label">Global gifters</label>
                </div>
                <ui-form-field
                  label="Nivel mínimo de gifter en TikTok"
                  for="t-global-min"
                  description="El nivel de la insignia de gifter de la cuenta."
                >
                  <input
                    uiInput
                    id="t-global-min"
                    type="number"
                    min="1"
                    max="60"
                    formControlName="globalGiftersMin"
                    aria-describedby="t-global-min-description"
                  />
                </ui-form-field>
              </div>
              <div class="grid gap-2">
                <div class="flex items-center gap-3">
                  <ui-switch inputId="t-top" formControlName="topGifters" />
                  <label for="t-top" class="type-label">Top gifters de tu sala</label>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <ui-form-field label="Top" for="t-top-n">
                    <input
                      uiInput
                      id="t-top-n"
                      type="number"
                      min="1"
                      max="20"
                      formControlName="topN"
                    />
                  </ui-form-field>
                  <ui-form-field label="Periodo" for="t-top-scope">
                    <select uiNativeSelect id="t-top-scope" formControlName="topScope">
                      <option value="session">Este live</option>
                      <option value="week">Semana</option>
                      <option value="total">Histórico</option>
                    </select>
                  </ui-form-field>
                </div>
              </div>
            </div>
          }
          <div class="grid gap-4 md:grid-cols-2">
            <ui-form-field
              label="Leer siempre a"
              for="t-always"
              description="Un @usuario por línea; se leen aunque no estén en los grupos."
            >
              <textarea
                uiTextarea
                id="t-always"
                class="font-mono"
                formControlName="alwaysRead"
                aria-describedby="t-always-description"
              ></textarea>
            </ui-form-field>
            <ui-form-field
              label="No leer nunca a"
              for="t-never"
              description="Un @usuario por línea; gana sobre todo lo demás."
            >
              <textarea
                uiTextarea
                id="t-never"
                class="font-mono"
                formControlName="neverRead"
                aria-describedby="t-never-description"
              ></textarea>
            </ui-form-field>
          </div>
        </fieldset>

        <fieldset class="grid gap-4">
          <legend class="type-overline mb-2">Formato del texto leído</legend>
          <div class="flex flex-wrap gap-x-8 gap-y-3">
            <div class="flex items-center gap-3">
              <ui-switch inputId="t-caps" formControlName="lowercaseShouting" />
              <label for="t-caps" class="type-label">Leer MAYÚSCULAS como texto normal</label>
            </div>
            <div class="flex items-center gap-3">
              <ui-switch inputId="t-rep" formControlName="collapseRepeats" />
              <label for="t-rep" class="type-label">Acortar repeticiones (jajajaja → jaja)</label>
            </div>
            <div class="flex items-center gap-3">
              <ui-switch inputId="t-punct" formControlName="collapsePunctuation" />
              <label for="t-punct" class="type-label">Acortar signos (!!!!! → !)</label>
            </div>
            <div class="flex items-center gap-3">
              <ui-switch inputId="t-nick" formControlName="cleanNicknames" />
              <label for="t-nick" class="type-label">Limpiar apodos (✨𝓜𝓪𝓻𝓲𝓪✨ → Maria)</label>
            </div>
          </div>
        </fieldset>

        <fieldset class="grid gap-4">
          <legend class="type-overline mb-2">Otros idiomas y alfabetos</legend>
          <div class="form-grid">
            <ui-form-field
              label="Otro alfabeto"
              for="t-script"
              description="Cirílico, árabe, chino, coreano… distinto al de la voz."
            >
              <select
                uiNativeSelect
                id="t-script"
                formControlName="otherScript"
                aria-describedby="t-script-description"
              >
                <option value="skip">No leer el comentario</option>
                <option value="strip">Quitar esas letras y leer el resto</option>
                <option value="switchVoice">Leerlo con una voz de ese idioma</option>
                <option value="read">Leerlo igual con la voz configurada</option>
              </select>
            </ui-form-field>
            <ui-form-field
              label="Otro idioma, mismo alfabeto"
              for="t-other"
              description="Por ejemplo inglés o portugués con una voz en español."
            >
              <select
                uiNativeSelect
                id="t-other"
                formControlName="otherLanguage"
                aria-describedby="t-other-description"
              >
                <option value="skip">No leer el comentario</option>
                <option value="switchVoice">Leerlo con una voz del idioma detectado</option>
                <option value="read">Leerlo igual con la voz configurada</option>
              </select>
            </ui-form-field>
            <ui-form-field
              label="Detectar idioma desde (letras)"
              for="t-minlen"
              description="Los comentarios más cortos se leen sin revisar el idioma."
            >
              <input
                uiInput
                id="t-minlen"
                type="number"
                min="5"
                max="200"
                formControlName="detectionMinLength"
                aria-describedby="t-minlen-description"
              />
            </ui-form-field>
            <ui-form-field
              label="Idiomas que también se aceptan"
              for="t-accept"
              description="Códigos separados por coma, p. ej.: en, pt"
            >
              <input
                uiInput
                id="t-accept"
                formControlName="alsoAccept"
                aria-describedby="t-accept-description"
              />
            </ui-form-field>
          </div>
        </fieldset>
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
          Guardar voz
        </button>
      </footer>
    </form>
  `,
})
export class TtsForm {
  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false);
  protected readonly previewing = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | undefined>(undefined);
  private readonly edgeVoices = signal<TtsVoiceInfo[]>([]);
  private readonly edgeError = signal(false);
  private readonly browserVoices = signal<SpeechSynthesisVoice[]>([]);
  protected readonly sample = new FormControl('Hola, gracias por estar en el live', {
    nonNullable: true,
  });

  protected readonly form = new FormGroup({
    engine: new FormControl<TtsEngine>('browser', { nonNullable: true }),
    language: new FormControl('es-MX', { nonNullable: true }),
    gender: new FormControl<VoiceGender>('female', { nonNullable: true }),
    voiceName: new FormControl('', { nonNullable: true }),
    rate: new FormControl(1, { nonNullable: true }),
    pitch: new FormControl(1, { nonNullable: true }),
    everyone: new FormControl(true, { nonNullable: true }),
    followers: new FormControl(false, { nonNullable: true }),
    superfans: new FormControl(false, { nonNullable: true }),
    moderators: new FormControl(false, { nonNullable: true }),
    fanClub: new FormControl(false, { nonNullable: true }),
    fanClubMin: new FormControl(1, { nonNullable: true }),
    globalGifters: new FormControl(false, { nonNullable: true }),
    globalGiftersMin: new FormControl(10, { nonNullable: true }),
    topGifters: new FormControl(false, { nonNullable: true }),
    topN: new FormControl(3, { nonNullable: true }),
    topScope: new FormControl<Scope>('session', { nonNullable: true }),
    alwaysRead: new FormControl('', { nonNullable: true }),
    neverRead: new FormControl('', { nonNullable: true }),
    lowercaseShouting: new FormControl(true, { nonNullable: true }),
    collapseRepeats: new FormControl(true, { nonNullable: true }),
    collapsePunctuation: new FormControl(true, { nonNullable: true }),
    cleanNicknames: new FormControl(true, { nonNullable: true }),
    otherScript: new FormControl<OtherScript>('skip', { nonNullable: true }),
    otherLanguage: new FormControl<OtherLanguage>('skip', { nonNullable: true }),
    detectionMinLength: new FormControl(20, { nonNullable: true }),
    alsoAccept: new FormControl('', { nonNullable: true }),
  });

  protected readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly locales = computed(() => {
    const fromVoices = this.edgeVoices().map((v) => v.locale);
    const current = this.value().language ?? 'es-MX';
    return [...new Set([current, ...COMMON_LOCALES, ...fromVoices])].sort((a, b) =>
      a.localeCompare(b),
    );
  });

  protected readonly voiceOptions = computed<VoiceOption[]>(() => {
    const v = this.value();
    const lang = v.language ?? 'es-MX';
    const gender = v.gender ?? 'any';
    if (v.engine === 'browser') {
      return this.browserVoices()
        .filter((voice) => primary(voice.lang) === primary(lang))
        .map((voice) => ({ value: voice.name, label: `${voice.name} (${voice.lang})` }));
    }
    return this.edgeVoices()
      .filter((voice) => voice.locale === lang && (gender === 'any' || voice.gender === gender))
      .map((voice) => ({
        value: voice.name,
        label: `${voice.displayName} · ${voice.gender === 'female' ? 'mujer' : 'hombre'}`,
      }));
  });

  protected readonly engineHint = computed(() =>
    this.value().engine === 'edge'
      ? this.edgeError()
        ? 'No se pudo cargar el catálogo de Edge (¿sin internet?). Si falla al leer, la pantalla de audio usa la voz del navegador.'
        : 'Gratis y sin clave. Necesita internet: el texto se envía a Microsoft para generar el audio.'
      : 'Usa las voces instaladas en la PC donde corre la pantalla de audio (OBS / LIVE Studio).',
  );

  protected readonly voiceHint = computed(() =>
    this.value().engine === 'browser'
      ? 'La lista muestra las voces de este navegador; en la PC de stream pueden ser otras.'
      : undefined,
  );

  constructor() {
    void this.api.get<TtsSettings>('/settings/tts').then((s) => this.fill(s));
    void this.api
      .get<TtsVoiceInfo[]>('/tts/voices')
      .then((voices) => this.edgeVoices.set(voices))
      .catch(() => this.edgeError.set(true));
    this.loadBrowserVoices();
  }

  protected label(locale: string): string {
    return localeLabel(locale);
  }

  protected async save(): Promise<void> {
    const candidate = TtsSettingsSchema.safeParse(this.toSettings());
    if (!candidate.success) {
      this.message.set({
        ok: false,
        text: `Revisa los valores: ${candidate.error.issues[0]?.message ?? ''}`,
      });
      return;
    }
    this.busy.set(true);
    try {
      this.fill(await this.api.put<TtsSettings>('/settings/tts', candidate.data));
      this.message.set({ ok: true, text: 'Voz guardada y aplicada.' });
    } catch (e) {
      this.message.set({ ok: false, text: e instanceof ApiError ? e.message : String(e) });
    } finally {
      this.busy.set(false);
    }
  }

  protected async preview(): Promise<void> {
    const v = this.form.getRawValue();
    const text = this.sample.value.trim() || 'Hola';
    this.message.set(undefined);
    if (v.engine === 'browser') {
      this.previewInBrowser(text);
      return;
    }
    this.previewing.set(true);
    try {
      const audio = await this.api.postForBlob('/tts/preview', {
        text,
        lang: v.language,
        gender: v.gender,
        rate: Number(v.rate),
        pitch: Number(v.pitch),
        ...(v.voiceName ? { voice: v.voiceName } : {}),
      });
      const url = URL.createObjectURL(audio);
      const player = new Audio(url);
      player.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
      await player.play();
    } catch (e) {
      const detail = e instanceof ApiError && e.status !== 0 ? ` (${e.status})` : '';
      this.message.set({
        ok: false,
        text: `No se pudo generar la voz de Edge${detail}. Revisa la conexión a internet.`,
      });
    } finally {
      this.previewing.set(false);
    }
  }

  private previewInBrowser(text: string): void {
    if (!('speechSynthesis' in window)) {
      this.message.set({ ok: false, text: 'Este navegador no tiene voces.' });
      return;
    }
    const v = this.form.getRawValue();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = this.browserVoices();
    const voice =
      voices.find((x) => x.name === v.voiceName) ??
      voices.find((x) => x.lang === v.language) ??
      voices.find((x) => primary(x.lang) === primary(v.language));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? v.language;
    utterance.rate = Number(v.rate);
    utterance.pitch = Number(v.pitch);
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  private loadBrowserVoices(): void {
    if (!('speechSynthesis' in window)) return;
    const refresh = () => this.browserVoices.set(speechSynthesis.getVoices());
    refresh();
    speechSynthesis.addEventListener('voiceschanged', refresh);
    this.destroyRef.onDestroy(() => speechSynthesis.removeEventListener('voiceschanged', refresh));
  }

  private toSettings(): unknown {
    const v = this.form.getRawValue();
    return {
      voice: {
        engine: v.engine,
        language: v.language,
        gender: v.gender,
        voiceName: v.voiceName,
        rate: Number(v.rate),
        pitch: Number(v.pitch),
      },
      audience: {
        everyone: v.everyone,
        followers: v.followers,
        superfans: v.superfans,
        moderators: v.moderators,
        fanClub: { enabled: v.fanClub, minLevel: v.fanClubMin },
        globalGifters: { enabled: v.globalGifters, minLevel: v.globalGiftersMin },
        topGifters: { enabled: v.topGifters, top: v.topN, scope: v.topScope },
        alwaysRead: lines(v.alwaysRead),
        neverRead: lines(v.neverRead),
      },
      format: {
        lowercaseShouting: v.lowercaseShouting,
        collapseRepeats: v.collapseRepeats,
        collapsePunctuation: v.collapsePunctuation,
        cleanNicknames: v.cleanNicknames,
      },
      language: {
        otherScript: v.otherScript,
        otherLanguage: v.otherLanguage,
        detectionMinLength: v.detectionMinLength,
        alsoAccept: lines(v.alsoAccept).map((l) => l.toLowerCase()),
      },
    };
  }

  private fill(s: TtsSettings): void {
    const a = s.audience;
    this.form.reset({
      engine: s.voice.engine,
      language: s.voice.language,
      gender: s.voice.gender,
      voiceName: s.voice.voiceName,
      rate: s.voice.rate,
      pitch: s.voice.pitch,
      everyone: a.everyone,
      followers: a.followers,
      superfans: a.superfans,
      moderators: a.moderators,
      fanClub: a.fanClub.enabled,
      fanClubMin: a.fanClub.minLevel,
      globalGifters: a.globalGifters.enabled,
      globalGiftersMin: a.globalGifters.minLevel,
      topGifters: a.topGifters.enabled,
      topN: a.topGifters.top,
      topScope: a.topGifters.scope,
      alwaysRead: a.alwaysRead.join('\n'),
      neverRead: a.neverRead.join('\n'),
      ...s.format,
      otherScript: s.language.otherScript,
      otherLanguage: s.language.otherLanguage,
      detectionMinLength: s.language.detectionMinLength,
      alsoAccept: s.language.alsoAccept.join(', '),
    });
  }
}
