import { francAll } from 'franc-min';
import type { LanguageScorer } from '../../domain/tts/speech-language.js';

/** ISO 639-1 (what voices use) <-> ISO 639-3 (what franc returns), for the candidates we ask. */
const TO_ISO3: Readonly<Record<string, string>> = {
  es: 'spa',
  en: 'eng',
  pt: 'por',
  fr: 'fra',
  it: 'ita',
  de: 'deu',
  nl: 'nld',
  pl: 'pol',
  tr: 'tur',
  id: 'ind',
  ca: 'cat',
  ro: 'ron',
  sv: 'swe',
  cs: 'ces',
  hu: 'hun',
  vi: 'vie',
  tl: 'tgl',
};
const TO_ISO1 = new Map(Object.entries(TO_ISO3).map(([iso1, iso3]) => [iso3, iso1]));

/**
 * franc-min (trigram model, offline). Restricting it to a few candidates is what makes it usable
 * on chat-sized text; languages it does not know are ignored.
 */
export const francLanguageScorer: LanguageScorer = (text, candidates) => {
  const only = candidates.map((c) => TO_ISO3[c]).filter((c): c is string => c !== undefined);
  if (only.length === 0) return [];
  return francAll(text, { only, minLength: 1 })
    .map(([iso3, score]) => [TO_ISO1.get(iso3), score] as const)
    .filter((entry): entry is readonly [string, number] => entry[0] !== undefined)
    .map(([lang, score]) => [lang, score]);
};
