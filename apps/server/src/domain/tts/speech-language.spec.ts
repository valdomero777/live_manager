import { TtsLanguageSchema, type TtsLanguage } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { prepareSpeechLanguage, primaryLanguage, type LanguageScorer } from './speech-language.js';

const settings = (over: Partial<TtsLanguage> = {}): TtsLanguage =>
  TtsLanguageSchema.parse({ detectionMinLength: 10, ...over });

/** Fake detector: answers with a fixed ranking and records what it was asked. */
function scorer(ranking: [string, number][]): LanguageScorer & { calls: string[][] } {
  const calls: string[][] = [];
  const fn = ((_text: string, candidates: readonly string[]) => {
    calls.push([...candidates]);
    return ranking;
  }) as LanguageScorer & { calls: string[][] };
  fn.calls = calls;
  return fn;
}

const spanish = scorer([
  ['es', 1],
  ['pt', 0.8],
]);

describe('primaryLanguage', () => {
  it('drops region and script subtags', () => {
    expect(primaryLanguage('es-MX')).toBe('es');
    expect(primaryLanguage('sr-Latn-RS')).toBe('sr');
  });
});

describe('other alphabets', () => {
  const russian = 'привет всем как дела';

  it('skips a comment written in another alphabet by default', () => {
    expect(prepareSpeechLanguage(russian, 'es-MX', settings(), spanish)).toBeNull();
  });

  it('switchVoice reads it with a voice of that alphabet', () => {
    const s = settings({ otherScript: 'switchVoice' });
    expect(prepareSpeechLanguage(russian, 'es-MX', s, spanish)).toEqual({
      text: russian,
      lang: 'ru',
    });
    expect(prepareSpeechLanguage('こんにちは', 'es-MX', s, spanish)?.lang).toBe('ja');
    expect(prepareSpeechLanguage('안녕하세요', 'es-MX', s, spanish)?.lang).toBe('ko');
  });

  it('strip removes the foreign letters; nothing left means skip', () => {
    const s = settings({ otherScript: 'strip' });
    expect(prepareSpeechLanguage('ok привет всем', 'es-MX', s, spanish)?.text).toBe('ok');
    expect(prepareSpeechLanguage(russian, 'es-MX', s, spanish)).toBeNull();
  });

  it('read leaves the text untouched with the configured voice', () => {
    const s = settings({ otherScript: 'read' });
    expect(prepareSpeechLanguage(russian, 'es-MX', s, spanish)).toEqual({
      text: russian,
      lang: 'es-MX',
    });
  });

  it('a few foreign letters inside a Spanish comment are removed, not the whole comment', () => {
    expect(prepareSpeechLanguage('hola a todos ツ', 'es-MX', settings(), spanish)).toEqual({
      text: 'hola a todos',
      lang: 'es-MX',
    });
  });

  it('a Russian voice reads Cyrillic and treats Latin as foreign', () => {
    expect(prepareSpeechLanguage(russian, 'ru-RU', settings(), spanish)?.lang).toBe('ru-RU');
    expect(prepareSpeechLanguage('hello everybody', 'ru-RU', settings(), spanish)).toBeNull();
  });

  it('digits, punctuation and spaces never count as another alphabet', () => {
    expect(prepareSpeechLanguage('100 !!! :)', 'ja-JP', settings(), spanish)?.text).toBe(
      '100 !!! :)',
    );
  });
});

describe('other languages with the same alphabet', () => {
  const english = scorer([
    ['en', 1],
    ['es', 0.6],
  ]);
  const text = 'this stream is really awesome today';

  it('skips English for a Spanish voice by default', () => {
    expect(prepareSpeechLanguage(text, 'es-MX', settings(), english)).toBeNull();
  });

  it('switchVoice returns the detected language', () => {
    const s = settings({ otherLanguage: 'switchVoice' });
    expect(prepareSpeechLanguage(text, 'es-MX', s, english)).toEqual({ text, lang: 'en' });
  });

  it('alsoAccept languages are read with the configured voice', () => {
    const s = settings({ alsoAccept: ['en'] });
    expect(prepareSpeechLanguage(text, 'es-MX', s, english)?.lang).toBe('es-MX');
  });

  it('keeps the comment when the voice language scores close to the best one', () => {
    const close = scorer([
      ['pt', 1],
      ['es', 0.95],
    ]);
    expect(prepareSpeechLanguage(text, 'es-MX', settings(), close)?.lang).toBe('es-MX');
  });

  it('short comments are not checked (detection is unreliable)', () => {
    const fake = scorer([['en', 1]]);
    expect(prepareSpeechLanguage('good game', 'es-MX', settings(), fake)?.text).toBe('good game');
    expect(fake.calls).toHaveLength(0);
  });

  it('asks the detector with the voice language among the candidates', () => {
    const fake = scorer([['es', 1]]);
    prepareSpeechLanguage('hola a todos los del directo', 'es-MX', settings(), fake);
    expect(fake.calls[0]).toContain('es');
    expect(fake.calls[0]).toContain('en');
  });

  it('read never calls the detector', () => {
    const fake = scorer([['en', 1]]);
    expect(prepareSpeechLanguage(text, 'es-MX', settings({ otherLanguage: 'read' }), fake)).toEqual(
      {
        text,
        lang: 'es-MX',
      },
    );
    expect(fake.calls).toHaveLength(0);
  });
});
