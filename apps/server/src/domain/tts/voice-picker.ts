import type { TtsVoiceInfo, VoiceGender } from '@tiklive/contracts';
import { primaryLanguage } from './speech-language.js';

/** Region used when only a language is known ("en" after switchVoice -> en-US). */
const PREFERRED_REGION: Readonly<Record<string, string>> = {
  es: 'es-MX',
  en: 'en-US',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ru: 'ru-RU',
  ar: 'ar-SA',
};

/**
 * Best voice for a language and gender: exact locale first, then the language's preferred
 * region, then any region; the gender is relaxed only when no voice of that gender exists.
 */
export function pickVoice(
  voices: readonly TtsVoiceInfo[],
  lang: string,
  gender: VoiceGender,
): TtsVoiceInfo | undefined {
  const primary = primaryLanguage(lang);
  const wantedLocale = lang.includes('-') ? lang.toLowerCase() : undefined;
  const preferred = PREFERRED_REGION[primary]?.toLowerCase();
  const sameLanguage = voices.filter((v) => primaryLanguage(v.locale) === primary);
  const rank = (v: TtsVoiceInfo): number => {
    const locale = v.locale.toLowerCase();
    if (locale === wantedLocale) return 0;
    if (locale === preferred) return 1;
    return 2;
  };
  const byGender =
    gender === 'any' ? sameLanguage : sameLanguage.filter((v) => v.gender === gender);
  const pool = byGender.length > 0 ? byGender : sameLanguage;
  return [...pool].sort((a, b) => rank(a) - rank(b))[0];
}
