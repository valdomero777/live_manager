import { TtsFormatSchema } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { formatSpeech, speakableNickname } from './speech-format.js';

const all = TtsFormatSchema.parse({});
const none = TtsFormatSchema.parse({
  lowercaseShouting: false,
  collapseRepeats: false,
  collapsePunctuation: false,
});

describe('formatSpeech', () => {
  it('lowercases shouted words but keeps short acronyms', () => {
    expect(formatSpeech('Saludos HOLA A TODOS desde MX', all)).toBe(
      'Saludos hola A todos desde MX',
    );
  });

  it('lowercases a comment shouted as a whole, short words included', () => {
    expect(formatSpeech('QUE BUENO ES ESTO', all)).toBe('que bueno es esto');
  });

  it('collapses laughter and repeated words', () => {
    expect(formatSpeech('jajajajaja que risa', all)).toBe('jaja que risa');
    expect(formatSpeech('JAJAJAJA', all)).toBe('jaja');
    expect(formatSpeech('gg gg gg gg', all)).toBe('gg gg');
    expect(formatSpeech('Hola hola HOLA', all)).toBe('Hola Hola');
  });

  it('does not touch words that only repeat twice', () => {
    expect(formatSpeech('coco y papa', all)).toBe('coco y papa');
  });

  it('collapses punctuation and symbol runs', () => {
    expect(formatSpeech('que???!!! wow... $$$', all)).toBe('que? wow. $');
    expect(formatSpeech('¿¿¿en serio???', all)).toBe('¿en serio?');
  });

  it('returns null when nothing readable is left', () => {
    expect(formatSpeech('!!! ???', all)).toBeNull();
  });

  it('each rule can be turned off', () => {
    expect(formatSpeech('JAJAJAJA!!!', none)).toBe('JAJAJAJA!!!');
  });
});

describe('speakableNickname', () => {
  it('turns fancy fonts into plain letters and drops decoration', () => {
    expect(speakableNickname('✨𝓜𝓪𝓻𝓲𝓪✨', 'maria_1')).toBe('Maria');
    expect(speakableNickname('ｊｕａｎ 🔥', 'juan')).toBe('juan');
  });

  it('keeps accents and normal separators', () => {
    expect(speakableNickname("José O'Neil-Pérez", 'jose')).toBe("José O'Neil-Pérez");
  });

  it('falls back to the @user when the nickname is only symbols', () => {
    expect(speakableNickname('🔥🔥🔥', 'maria_123')).toBe('maria 123');
    expect(speakableNickname('★', 'el.pepe')).toBe('el pepe');
  });
});
