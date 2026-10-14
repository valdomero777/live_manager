import {
  MAX_LEADERBOARD_LIMIT,
  TtsSettingsSchema,
  type Scope,
  type TtsSettings,
  type TtsSpeechRequest,
  type TtsVoiceInfo,
  type ViewerRef,
} from '@tiklive/contracts';
import type { SpeechVoice } from '../../domain/rules/actions.js';
import type { Clock } from '../../domain/shared/time.js';
import { canReadViewer, type TopGifterLookup } from '../../domain/tts/audience.js';
import { formatSpeech, speakableNickname } from '../../domain/tts/speech-format.js';
import {
  prepareSpeechLanguage,
  type LanguageScorer,
  type SpeechText,
} from '../../domain/tts/speech-language.js';
import { pickVoice } from '../../domain/tts/voice-picker.js';
import type { Logger } from '../ports/logger.js';
import type { SettingsRepository } from '../ports/settings-repository.js';
import { SpeechSynthesisError, type SpeechSynthesizer } from '../ports/speech-synthesizer.js';

export const TTS_SETTINGS_KEY = 'tts.settings';
/** The top-gifter ranking is re-read at most this often; a few seconds late is fine. */
export const TOP_GIFTERS_TTL_MS = 5_000;
/** The Edge voice catalogue barely changes. */
export const VOICES_TTL_MS = 6 * 60 * 60_000;

/** What the rule engine asks before planning a speak action. Every method is synchronous. */
export interface SpeechPolicy {
  /** Whether the voice may read this viewer's own text (audience settings). */
  allowsViewer(viewer: ViewerRef): boolean;
  /** Format + language/alphabet protection. null: do not read. */
  prepareText(text: string): SpeechText | null;
  speakableNickname(nickname: string, uniqueId: string): string;
  voice(): SpeechVoice;
}

interface TtsDeps {
  readonly repo: SettingsRepository;
  readonly synthesizer: SpeechSynthesizer;
  readonly scoreLanguages: LanguageScorer;
  /** uniqueIds of the room's diamond ranking in a period, best first. */
  readonly topGifters: (scope: Scope, limit: number) => Promise<readonly string[]>;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** TTS settings (voice, audience, format, language) edited from the UI and applied live. */
export class TtsService implements SpeechPolicy, TopGifterLookup {
  private settings: TtsSettings = TtsSettingsSchema.parse({});
  private readonly top = new Map<Scope, { ids: readonly string[]; at: number }>();
  private readonly refreshing = new Set<Scope>();
  private voiceCache: { at: number; voices: Promise<TtsVoiceInfo[]> } | undefined;

  constructor(private readonly deps: TtsDeps) {}

  async load(): Promise<void> {
    const stored = await this.deps.repo.get(TTS_SETTINGS_KEY, TtsSettingsSchema);
    if (stored) this.settings = stored;
    this.warmTopGifters();
  }

  get(): TtsSettings {
    return this.settings;
  }

  async update(settings: TtsSettings): Promise<TtsSettings> {
    await this.deps.repo.set(TTS_SETTINGS_KEY, settings);
    this.settings = settings;
    this.warmTopGifters();
    return settings;
  }

  allowsViewer(viewer: ViewerRef): boolean {
    return canReadViewer(viewer, this.settings.audience, this);
  }

  prepareText(text: string): SpeechText | null {
    const formatted = formatSpeech(text, this.settings.format);
    if (formatted === null) return null;
    const { voice, language } = this.settings;
    return prepareSpeechLanguage(formatted, voice.language, language, this.deps.scoreLanguages);
  }

  speakableNickname(nickname: string, uniqueId: string): string {
    return this.settings.format.cleanNicknames ? speakableNickname(nickname, uniqueId) : nickname;
  }

  voice(): SpeechVoice {
    const v = this.settings.voice;
    return {
      engine: v.engine,
      lang: v.language,
      gender: v.gender,
      rate: v.rate,
      pitch: v.pitch,
      ...(v.voiceName ? { voiceName: v.voiceName } : {}),
    };
  }

  /** Serves the last known ranking and refreshes it in the background when it is stale. */
  isTop(uniqueId: string, top: number, scope: Scope): boolean {
    const entry = this.top.get(scope);
    if (!entry || this.deps.clock.now() - entry.at >= TOP_GIFTERS_TTL_MS) this.refreshTop(scope);
    return entry?.ids.slice(0, top).includes(uniqueId.toLowerCase()) ?? false;
  }

  /** Edge voice catalogue, cached; a failed fetch is not cached. */
  voices(): Promise<TtsVoiceInfo[]> {
    const now = this.deps.clock.now();
    if (!this.voiceCache || now - this.voiceCache.at >= VOICES_TTL_MS) {
      const voices = this.deps.synthesizer.listVoices().catch((error: unknown) => {
        this.voiceCache = undefined;
        throw error;
      });
      this.voiceCache = { at: now, voices };
    }
    return this.voiceCache.voices;
  }

  /** MP3 for the audio screen or the dashboard preview. */
  async synthesize(request: TtsSpeechRequest): Promise<Uint8Array> {
    const voices = await this.voices();
    const exact = request.voice ? voices.find((v) => v.name === request.voice) : undefined;
    const voice = exact ?? pickVoice(voices, request.lang, request.gender);
    if (!voice) throw new SpeechSynthesisError(`No hay voces para el idioma ${request.lang}`);
    return this.deps.synthesizer.synthesize({
      text: request.text,
      voice: voice.name,
      ...(request.rate === undefined ? {} : { rate: request.rate }),
      ...(request.pitch === undefined ? {} : { pitch: request.pitch }),
    });
  }

  private warmTopGifters(): void {
    const { enabled, scope } = this.settings.audience.topGifters;
    if (enabled) this.refreshTop(scope);
  }

  private refreshTop(scope: Scope): void {
    if (this.refreshing.has(scope)) return;
    this.refreshing.add(scope);
    this.deps
      .topGifters(scope, MAX_LEADERBOARD_LIMIT)
      .then((ids) => {
        this.top.set(scope, { ids: ids.map((id) => id.toLowerCase()), at: this.deps.clock.now() });
      })
      .catch((error: unknown) => {
        this.deps.logger.warn({ scope, err: String(error) }, 'tts.top_gifters_failed');
      })
      .finally(() => this.refreshing.delete(scope));
  }
}
