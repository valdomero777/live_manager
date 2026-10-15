import { describe, expect, it } from 'vitest';
import { guessGender, pickBrowserVoice } from './browser-voice.js';

const voices = [
  { name: 'Microsoft Helena - Spanish (Spain)', lang: 'es-ES' },
  { name: 'Microsoft Raul - Spanish (Mexico)', lang: 'es-MX' },
  { name: 'Microsoft Sabina - Spanish (Mexico)', lang: 'es-MX' },
  { name: 'Google español de Estados Unidos', lang: 'es-US' },
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Google UK English Female', lang: 'en-GB' },
];

describe('guessGender', () => {
  it('recognises common Windows and Chrome voices', () => {
    expect(guessGender('Microsoft Sabina - Spanish (Mexico)')).toBe('female');
    expect(guessGender('Microsoft Raul - Spanish (Mexico)')).toBe('male');
    expect(guessGender('Google UK English Female')).toBe('female');
    expect(guessGender('Google UK English Male')).toBe('male');
    expect(guessGender('Unknown voice')).toBeUndefined();
  });
});

describe('pickBrowserVoice', () => {
  it('an exact voice name wins', () => {
    expect(
      pickBrowserVoice(voices, { voice: 'Microsoft Helena - Spanish (Spain)', lang: 'es-MX' })
        ?.lang,
    ).toBe('es-ES');
  });

  it('picks by language region and gender', () => {
    expect(pickBrowserVoice(voices, { lang: 'es-MX', gender: 'male' })?.name).toContain('Raul');
    expect(pickBrowserVoice(voices, { lang: 'es-MX', gender: 'female' })?.name).toContain('Sabina');
    expect(pickBrowserVoice(voices, { lang: 'en', gender: 'female' })?.name).toContain('Female');
  });

  it('falls back to any voice of the language when the gender is not available', () => {
    expect(pickBrowserVoice(voices, { lang: 'en-US', gender: 'female' })?.lang).toMatch(/^en/);
  });

  it('accepts a language tag in the voice field (older rules)', () => {
    expect(pickBrowserVoice(voices, { voice: 'en-US' })?.name).toContain('David');
  });

  it('defaults to Spanish and returns undefined when no voice fits', () => {
    expect(pickBrowserVoice(voices, {})?.lang).toMatch(/^es/);
    expect(pickBrowserVoice(voices, { lang: 'ja' })).toBeUndefined();
  });
});
