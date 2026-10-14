/** The part of SpeechSynthesisVoice we use; plain objects in tests. */
export interface BrowserVoiceLike {
  readonly name: string;
  readonly lang: string;
}

export type Gender = 'female' | 'male' | 'any';

export interface VoiceWish {
  /** Exact voice name, or a language tag (older rules wrote "es-MX" here). */
  readonly voice?: string | undefined;
  readonly lang?: string | undefined;
  readonly gender?: Gender | undefined;
}

/**
 * The Web Speech API does not expose a voice's gender, so it is guessed from well-known names
 * of the Windows, Edge, Chrome and macOS voices. "female" is checked before "male".
 */
const FEMALE =
  /female|mujer|sabina|helena|laura|dalia|paloma|elvira|zira|hazel|susan|heera|monica|paulina|lucia|carmen|mia\b|renata|francisca|hilda|jenny|aria|ava\b|emma|salma|larissa|ximena|elena|camila|catalina|beatriz|marisol|samantha|karen|tessa|moira|fiona|victoria|google espa[nñ]ol|google us english|google português/i;
const MALE =
  /\bmale|hombre|raul|raúl|pablo|jorge|alvaro|álvaro|david|mark\b|george|james|ravi|diego|juan|carlos|enrique|guy\b|andrew|brian|gonzalo|tomas|tomás|alex\b|daniel|fred\b|thomas|arthur|rishi/i;

export function guessGender(name: string): 'female' | 'male' | undefined {
  if (FEMALE.test(name)) return 'female';
  if (MALE.test(name)) return 'male';
  return undefined;
}

function primary(tag: string): string {
  return tag.split(/[-_]/)[0]!.toLowerCase();
}

function sameLocale(a: string, b: string): boolean {
  return a.replace('_', '-').toLowerCase() === b.replace('_', '-').toLowerCase();
}

/**
 * Exact name first; otherwise a voice of the language (exact region preferred) whose name looks
 * like the wanted gender, then any voice of the language. Default language: Spanish.
 */
export function pickBrowserVoice<V extends BrowserVoiceLike>(
  voices: readonly V[],
  wish: VoiceWish,
): V | undefined {
  if (wish.voice) {
    const named = voices.find((v) => v.name === wish.voice);
    if (named) return named;
  }
  const looksLikeTag =
    wish.voice !== undefined && /^[a-z]{2,3}([-_][A-Za-z0-9]+)*$/.test(wish.voice);
  const lang = wish.lang ?? (looksLikeTag ? wish.voice : undefined) ?? 'es';
  const ofLanguage = voices.filter((v) => primary(v.lang) === primary(lang));
  const rank = (v: V) => (sameLocale(v.lang, lang) ? 0 : 1);
  const sorted = [...ofLanguage].sort((a, b) => rank(a) - rank(b));
  const gender = wish.gender ?? 'any';
  if (gender !== 'any') {
    const match = sorted.find((v) => guessGender(v.name) === gender);
    if (match) return match;
  }
  return sorted[0];
}
