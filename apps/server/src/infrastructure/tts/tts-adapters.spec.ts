import { describe, expect, it } from 'vitest';
import { escapeXml, prosody } from './edge-speech-synthesizer.js';
import { francLanguageScorer } from './franc-language-scorer.js';

describe('Edge synthesizer helpers', () => {
  it('escapes viewer text so it cannot inject SSML tags', () => {
    expect(escapeXml(`<voice name="x">hola & "adiós"</voice>`)).toBe(
      '&lt;voice name=&quot;x&quot;&gt;hola &amp; &quot;adiós&quot;&lt;/voice&gt;',
    );
  });

  it('turns rate and pitch multipliers into SSML offsets', () => {
    expect(prosody({})).toEqual({ rate: '+0%', pitch: '+0Hz' });
    expect(prosody({ rate: 1.5, pitch: 0.8 })).toEqual({ rate: '+50%', pitch: '-10Hz' });
  });
});

describe('francLanguageScorer', () => {
  const candidates = ['es', 'en', 'pt', 'fr', 'it'];

  it('tells Spanish from English on chat-length text', () => {
    expect(
      francLanguageScorer('hola a todos, qué buen directo el de hoy', candidates)[0]?.[0],
    ).toBe('es');
    expect(
      francLanguageScorer('hello everyone, this stream is really good today', candidates)[0]?.[0],
    ).toBe('en');
  });

  it('answers in ISO 639-1 and only among the candidates', () => {
    const langs = francLanguageScorer('bom dia a todos vocês do Brasil', ['es', 'pt']).map(
      ([l]) => l,
    );
    expect(langs.every((l) => l === 'es' || l === 'pt')).toBe(true);
  });

  it('returns nothing for candidates it does not know', () => {
    expect(francLanguageScorer('hola', ['xx'])).toEqual([]);
  });
});
