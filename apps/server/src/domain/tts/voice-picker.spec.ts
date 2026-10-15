import type { TtsVoiceInfo } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { pickVoice } from './voice-picker.js';

const v = (name: string, locale: string, gender: 'female' | 'male'): TtsVoiceInfo => ({
  name,
  displayName: name,
  locale,
  gender,
});

const voices = [
  v('es-ES-ElviraNeural', 'es-ES', 'female'),
  v('es-ES-AlvaroNeural', 'es-ES', 'male'),
  v('es-MX-DaliaNeural', 'es-MX', 'female'),
  v('es-MX-JorgeNeural', 'es-MX', 'male'),
  v('en-GB-SoniaNeural', 'en-GB', 'female'),
  v('en-US-AriaNeural', 'en-US', 'female'),
  v('en-US-GuyNeural', 'en-US', 'male'),
  v('ru-RU-DmitryNeural', 'ru-RU', 'male'),
];

describe('pickVoice', () => {
  it('matches locale and gender exactly', () => {
    expect(pickVoice(voices, 'es-ES', 'male')?.name).toBe('es-ES-AlvaroNeural');
    expect(pickVoice(voices, 'es-MX', 'female')?.name).toBe('es-MX-DaliaNeural');
  });

  it('a bare language uses its preferred region', () => {
    expect(pickVoice(voices, 'en', 'female')?.name).toBe('en-US-AriaNeural');
    expect(pickVoice(voices, 'es', 'male')?.name).toBe('es-MX-JorgeNeural');
  });

  it('an unknown region falls back to another region of the same language', () => {
    expect(pickVoice(voices, 'es-AR', 'female')?.name).toMatch(/^es-/);
  });

  it('relaxes the gender only when the language has no voice of that gender', () => {
    expect(pickVoice(voices, 'ru', 'female')?.name).toBe('ru-RU-DmitryNeural');
  });

  it('returns undefined for a language without voices', () => {
    expect(pickVoice(voices, 'ja', 'any')).toBeUndefined();
  });
});
