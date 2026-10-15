export const LOCALES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
] as const;

export type LocaleCode = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: LocaleCode = 'es';
const STORAGE_KEY = 'tiklive.locale';

const isLocale = (value: unknown): value is LocaleCode =>
  LOCALES.some((locale) => locale.code === value);

/** The language the panel runs in. Spanish is the source language of every message. */
export function currentLocale(): LocaleCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Messages are bound at start-up, so a language change takes effect with a reload. */
export function changeLocale(code: LocaleCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Storage blocked: the panel stays in its current language.
    return;
  }
  location.reload();
}

/** Locale for number and time formatting: the panel language, or the regional variant it replaces. */
export function numberLocale(spanishVariant = 'es'): string {
  return currentLocale() === 'en' ? 'en' : spanishVariant;
}
