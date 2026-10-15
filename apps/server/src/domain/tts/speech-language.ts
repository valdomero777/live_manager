import type { TtsLanguage } from '@tiklive/contracts';

/** Unicode scripts we tell apart; any other letter counts as "Other". */
const SCRIPTS = [
  'Latin',
  'Cyrillic',
  'Greek',
  'Arabic',
  'Hebrew',
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Thai',
  'Devanagari',
  'Bengali',
  'Tamil',
  'Armenian',
  'Georgian',
] as const;
type Script = (typeof SCRIPTS)[number] | 'Other';

const SCRIPT_PATTERNS = SCRIPTS.map((s) => [s, new RegExp(`^\\p{Script=${s}}$`, 'u')] as const);
const LETTER = /\p{L}/u;

const LANGUAGE_SCRIPTS: Readonly<Record<string, readonly Script[]>> = {
  ru: ['Cyrillic'],
  uk: ['Cyrillic'],
  bg: ['Cyrillic'],
  be: ['Cyrillic'],
  sr: ['Cyrillic', 'Latin'],
  mk: ['Cyrillic'],
  kk: ['Cyrillic'],
  mn: ['Cyrillic'],
  el: ['Greek'],
  ar: ['Arabic'],
  fa: ['Arabic'],
  ur: ['Arabic'],
  he: ['Hebrew'],
  zh: ['Han'],
  ja: ['Han', 'Hiragana', 'Katakana'],
  ko: ['Hangul', 'Han'],
  th: ['Thai'],
  hi: ['Devanagari'],
  mr: ['Devanagari'],
  ne: ['Devanagari'],
  bn: ['Bengali'],
  ta: ['Tamil'],
  hy: ['Armenian'],
  ka: ['Georgian'],
};

/** The language a voice is picked for when a comment is written in another alphabet. */
const SCRIPT_LANGUAGE: Readonly<Partial<Record<Script, string>>> = {
  Cyrillic: 'ru',
  Greek: 'el',
  Arabic: 'ar',
  Hebrew: 'he',
  Han: 'zh',
  Hiragana: 'ja',
  Katakana: 'ja',
  Hangul: 'ko',
  Thai: 'th',
  Devanagari: 'hi',
  Bengali: 'bn',
  Tamil: 'ta',
  Armenian: 'hy',
  Georgian: 'ka',
};

/** Languages franc tells apart when a comment uses the Latin alphabet. */
const LATIN_CANDIDATES = ['es', 'en', 'pt', 'fr', 'it', 'de', 'nl', 'pl', 'tr', 'id'];

/** A detected language counts as the voice's own when its score is this close to the top. */
const SAME_LANGUAGE_MARGIN = 0.9;

/** Scores per ISO 639-1 language, best first, normalised so the best is 1. */
export type LanguageScorer = (text: string, candidates: readonly string[]) => [string, number][];

export interface SpeechText {
  readonly text: string;
  /** BCP 47 tag to read it with: the voice language, or another one after switchVoice. */
  readonly lang: string;
}

/** "es-MX" -> "es". */
export function primaryLanguage(tag: string): string {
  return tag.split('-')[0]!.toLowerCase();
}

function scriptsOf(tag: string): readonly Script[] {
  if (/-Latn\b/.test(tag)) return ['Latin'];
  if (/-Cyrl\b/.test(tag)) return ['Cyrillic'];
  return LANGUAGE_SCRIPTS[primaryLanguage(tag)] ?? ['Latin'];
}

function scriptOf(char: string): Script {
  return SCRIPT_PATTERNS.find(([, p]) => p.test(char))?.[0] ?? 'Other';
}

interface ScriptCount {
  readonly native: number;
  readonly foreign: number;
  /** Most frequent foreign script, if any. */
  readonly dominantForeign: Script | undefined;
}

function countScripts(text: string, allowed: readonly Script[]): ScriptCount {
  let native = 0;
  const foreign = new Map<Script, number>();
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    const script = scriptOf(char);
    if (allowed.includes(script)) native++;
    else foreign.set(script, (foreign.get(script) ?? 0) + 1);
  }
  let dominantForeign: Script | undefined;
  let total = 0;
  for (const [script, count] of foreign) {
    total += count;
    if (dominantForeign === undefined || count > foreign.get(dominantForeign)!) {
      dominantForeign = script;
    }
  }
  return { native, foreign: total, dominantForeign };
}

function stripForeign(text: string, allowed: readonly Script[]): string | null {
  const kept = [...text].filter((c) => !LETTER.test(c) || allowed.includes(scriptOf(c))).join('');
  const clean = kept.replace(/\s+/g, ' ').trim();
  return /\p{L}/u.test(clean) ? clean : null;
}

function letterCount(text: string): number {
  return [...text].filter((c) => LETTER.test(c)).length;
}

/**
 * Protects the voice from text it cannot read well. Returns null when the comment should not be
 * read. A few foreign letters inside a comment in the voice's alphabet (a "ツ" kaomoji) are
 * always removed; the configured policy decides when the foreign alphabet dominates.
 */
export function prepareSpeechLanguage(
  text: string,
  voiceLang: string,
  settings: TtsLanguage,
  score: LanguageScorer,
): SpeechText | null {
  const allowed = scriptsOf(voiceLang);
  const counts = countScripts(text, allowed);
  if (counts.foreign > 0) {
    if (settings.otherScript === 'read') return { text, lang: voiceLang };
    if (counts.native >= counts.foreign) {
      const stripped = stripForeign(text, allowed);
      return stripped === null ? null : { text: stripped, lang: voiceLang };
    }
    switch (settings.otherScript) {
      case 'skip':
        return null;
      case 'strip': {
        const stripped = stripForeign(text, allowed);
        return stripped === null ? null : { text: stripped, lang: voiceLang };
      }
      case 'switchVoice': {
        const lang = SCRIPT_LANGUAGE[counts.dominantForeign!];
        return lang === undefined ? null : { text, lang };
      }
    }
  }
  return checkLanguage(text, voiceLang, allowed, settings, score);
}

/** Same alphabet: only Latin text is compared, and only when it is long enough to tell. */
function checkLanguage(
  text: string,
  voiceLang: string,
  allowed: readonly Script[],
  settings: TtsLanguage,
  score: LanguageScorer,
): SpeechText | null {
  const keep = { text, lang: voiceLang };
  if (settings.otherLanguage === 'read' || !allowed.includes('Latin')) return keep;
  if (letterCount(text) < settings.detectionMinLength) return keep;
  const own = primaryLanguage(voiceLang);
  const accepted = new Set([own, ...settings.alsoAccept]);
  const candidates = [...new Set([...accepted, ...LATIN_CANDIDATES])];
  const scores = score(text, candidates);
  const best = scores[0];
  if (!best || accepted.has(best[0])) return keep;
  const ownScore = scores.find(([lang]) => accepted.has(lang))?.[1] ?? 0;
  if (ownScore >= SAME_LANGUAGE_MARGIN) return keep;
  return settings.otherLanguage === 'switchVoice' ? { text, lang: best[0] } : null;
}
