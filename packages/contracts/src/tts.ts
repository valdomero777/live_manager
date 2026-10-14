import { z } from 'zod';
import { ScopeSchema } from './projections.js';

/**
 * Text-to-speech: which voice reads, whom it reads, how the text is cleaned and what happens
 * with comments in another language or alphabet. Stored in the database and applied live.
 */

/** browser: Web Speech API of the audio screen. edge: Microsoft Edge neural voices (server). */
export const TTS_ENGINES = ['browser', 'edge'] as const;
export const TtsEngineSchema = z.enum(TTS_ENGINES);
export type TtsEngine = z.infer<typeof TtsEngineSchema>;

export const VOICE_GENDERS = ['female', 'male', 'any'] as const;
export const VoiceGenderSchema = z.enum(VOICE_GENDERS);
export type VoiceGender = z.infer<typeof VoiceGenderSchema>;

/** BCP 47 tag such as "es", "es-MX" or "sr-Latn-RS". */
export const LanguageTagSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'Idioma no válido (ejemplo: es-MX)');

export const TtsVoiceSettingsSchema = z.object({
  engine: TtsEngineSchema.default('browser'),
  language: LanguageTagSchema.default('es-MX'),
  gender: VoiceGenderSchema.default('female'),
  /** Exact voice (Edge ShortName or browser voice name); empty picks one by language + gender. */
  voiceName: z.string().trim().max(120).default(''),
  rate: z.number().min(0.5).max(2).default(1),
  pitch: z.number().min(0.5).max(1.5).default(1),
});
export type TtsVoiceSettings = z.infer<typeof TtsVoiceSettingsSchema>;

const uniqueIdList = z
  .array(
    z
      .string()
      .trim()
      .transform((u) => u.replace(/^@/, '').toLowerCase())
      .pipe(z.string().min(1).max(64)),
  )
  .max(500)
  .default([]);

/**
 * Whose comments are read. A viewer is read when listed in alwaysRead, or when `everyone` is on,
 * or when they belong to at least one enabled group. neverRead always wins.
 */
export const TtsAudienceSchema = z.object({
  everyone: z.boolean().default(true),
  followers: z.boolean().default(false),
  /** TikTok LIVE subscribers ("Super Fans"). */
  superfans: z.boolean().default(false),
  moderators: z.boolean().default(false),
  fanClub: z
    .object({
      enabled: z.boolean().default(false),
      minLevel: z.number().int().min(1).max(50).default(1),
    })
    .default({ enabled: false, minLevel: 1 }),
  /** TikTok-wide gifter level shown on the viewer's badge. */
  globalGifters: z
    .object({
      enabled: z.boolean().default(false),
      minLevel: z.number().int().min(1).max(60).default(10),
    })
    .default({ enabled: false, minLevel: 10 }),
  /** The top N of this room's diamond ranking in a period. */
  topGifters: z
    .object({
      enabled: z.boolean().default(false),
      top: z.number().int().min(1).max(20).default(3),
      scope: ScopeSchema.default('session'),
    })
    .default({ enabled: false, top: 3, scope: 'session' }),
  alwaysRead: uniqueIdList,
  neverRead: uniqueIdList,
});
export type TtsAudience = z.infer<typeof TtsAudienceSchema>;

/** Spoken-text cleanup applied after moderation, only to what the voice reads. */
export const TtsFormatSchema = z.object({
  /** "HOLA A TODOS" -> "hola a todos": engines otherwise spell shouted words letter by letter. */
  lowercaseShouting: z.boolean().default(true),
  /** "jaja jaja jaja jaja" -> "jaja jaja"; "jajajajaja" -> "jaja". */
  collapseRepeats: z.boolean().default(true),
  /** "!!!!!!" -> "!", "?¿?¿?" -> "?". */
  collapsePunctuation: z.boolean().default(true),
  /** Removes emojis and decorative symbols from {nickname}; falls back to the @user. */
  cleanNicknames: z.boolean().default(true),
});
export type TtsFormat = z.infer<typeof TtsFormatSchema>;

/** skip: do not read. strip: drop only the foreign letters. switchVoice: read with a voice of
 * the detected language. read: read anyway with the configured voice. */
export const OTHER_SCRIPT_POLICIES = ['skip', 'strip', 'switchVoice', 'read'] as const;
export const OTHER_LANGUAGE_POLICIES = ['skip', 'switchVoice', 'read'] as const;

export const TtsLanguageSchema = z.object({
  /** Letters of an alphabet the voice language does not use (Cyrillic, Arabic, CJK...). */
  otherScript: z.enum(OTHER_SCRIPT_POLICIES).default('skip'),
  /** Same alphabet, different language (English for a Spanish voice). */
  otherLanguage: z.enum(OTHER_LANGUAGE_POLICIES).default('skip'),
  /** Shorter comments are not checked: detection is unreliable on a few words. */
  detectionMinLength: z.number().int().min(5).max(200).default(20),
  /** Languages read as if they were the voice language (for example "en" for Spanglish). */
  alsoAccept: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[a-z]{2,3}$/),
    )
    .max(10)
    .default([]),
});
export type TtsLanguage = z.infer<typeof TtsLanguageSchema>;

export const TtsSettingsSchema = z.object({
  voice: TtsVoiceSettingsSchema.default(TtsVoiceSettingsSchema.parse({})),
  audience: TtsAudienceSchema.default(TtsAudienceSchema.parse({})),
  format: TtsFormatSchema.default(TtsFormatSchema.parse({})),
  language: TtsLanguageSchema.default(TtsLanguageSchema.parse({})),
});
export type TtsSettings = z.infer<typeof TtsSettingsSchema>;

/** A voice of the Edge catalogue (GET /tts/voices). */
export const TtsVoiceInfoSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  locale: z.string(),
  gender: z.enum(['female', 'male']),
});
export type TtsVoiceInfo = z.infer<typeof TtsVoiceInfoSchema>;

/** Body of POST /overlay-data/tts (audio screen) and POST /api/v1/tts/preview (dashboard). */
export const TtsSpeechRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  lang: LanguageTagSchema,
  gender: VoiceGenderSchema.default('any'),
  voice: z.string().trim().max(120).optional(),
  rate: z.number().min(0.1).max(4).optional(),
  pitch: z.number().min(0).max(2).optional(),
});
export type TtsSpeechRequest = z.infer<typeof TtsSpeechRequestSchema>;
