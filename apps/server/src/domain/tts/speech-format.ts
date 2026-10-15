import type { TtsFormat } from '@tiklive/contracts';
import { plainText } from './text-filters.js';

/** Words this long or longer written in capitals are read as normal words, not spelled. */
const SHOUT_MIN_LETTERS = 4;
const WORD = /[\p{L}\p{N}]+/gu;
/** A syllable of 1-4 letters repeated 3+ times inside a word: "jajajaja", "hahaha". */
const REPEATED_SYLLABLE = /(\p{L}{1,4}?)\1{2,}/giu;
/** The same word 3+ times in a row, any case: "jaja jaja jaja". */
const REPEATED_WORD = /(?<![\p{L}\p{N}])([\p{L}\p{N}]+)(?:\s+\1(?![\p{L}\p{N}])){2,}/giu;
/** Runs of the same or mixed punctuation: "!!!", "?¿?¿", "...". */
const PUNCTUATION_RUN = /([!?¡¿.,;:])[!?¡¿.,;:]+/gu;
/** Runs of the same symbol: "$$$", "***". */
const SYMBOL_RUN = /(\p{S})\1+/gu;
/** What a nickname keeps: letters, digits, spaces and a few separators. */
const NICKNAME_NOISE = /[^\p{L}\p{N}\p{M}\s'.-]/gu;
const MIN_NICKNAME_LETTERS = 2;

/** A comment this shouted as a whole ("JAJA QUE BUENO") is lowercased entirely. */
const SHOUTED_RATIO = 0.7;
const SHOUTED_MIN_LETTERS = 6;

function lowercaseShouting(text: string): string {
  const cased = [...text].filter((c) => /[\p{Lu}\p{Ll}]/u.test(c));
  const upper = cased.filter((c) => /\p{Lu}/u.test(c)).length;
  if (cased.length >= SHOUTED_MIN_LETTERS && upper / cased.length >= SHOUTED_RATIO) {
    return text.toLocaleLowerCase();
  }
  return text.replace(WORD, (word) =>
    word.length >= SHOUT_MIN_LETTERS && word === word.toLocaleUpperCase() && /\p{Lu}/u.test(word)
      ? word.toLocaleLowerCase()
      : word,
  );
}

function collapseRepeats(text: string): string {
  return text
    .replace(REPEATED_SYLLABLE, '$1$1')
    .replace(REPEATED_WORD, (_match, word: string) => `${word} ${word}`);
}

function collapsePunctuation(text: string): string {
  return text.replace(PUNCTUATION_RUN, '$1').replace(SYMBOL_RUN, '$1');
}

/** Spoken-text cleanup after moderation (TtsFormat). Returns null if nothing readable is left. */
export function formatSpeech(text: string, format: TtsFormat): string | null {
  let out = text;
  if (format.lowercaseShouting) out = lowercaseShouting(out);
  if (format.collapseRepeats) out = collapseRepeats(out);
  if (format.collapsePunctuation) out = collapsePunctuation(out);
  out = out.replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(out) ? out : null;
}

/**
 * "✨𝓜𝓪𝓻𝓲𝓪✨" -> "Maria". When almost nothing readable is left, the @user is read instead,
 * with "_" and "." spoken as spaces ("maria_123" -> "maria 123").
 */
export function speakableNickname(nickname: string, uniqueId: string): string {
  const clean = plainText(nickname).replace(NICKNAME_NOISE, ' ').replace(/\s+/g, ' ').trim();
  const letters = [...clean].filter((c) => /\p{L}/u.test(c)).length;
  if (letters >= MIN_NICKNAME_LETTERS) return clean;
  return uniqueId.replace(/[_.]+/g, ' ').trim() || uniqueId;
}
