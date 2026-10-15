import { describe, expect, it } from 'vitest';
import english from './messages.en.json';
import source from './messages.json';

const PLACEHOLDER = /\{\$[A-Z_0-9]+\}/g;
const placeholders = (text: string): string[] => (text.match(PLACEHOLDER) ?? []).sort();

/**
 * `messages.json` is what `npm run i18n:extract` finds in the code; every message in it needs an
 * English text with the same placeholders, or the English panel falls back to Spanish.
 */
describe('English translations', () => {
  const messages = source.translations as Record<string, string>;
  const translations = english.translations as Record<string, string>;

  it('cover every extracted message and nothing else', () => {
    expect(Object.keys(translations).sort()).toEqual(Object.keys(messages).sort());
  });

  it('keep the placeholders of the source message', () => {
    const broken = Object.entries(messages)
      .filter(
        ([id, text]) => placeholders(text).join() !== placeholders(translations[id] ?? '').join(),
      )
      .map(([, text]) => text);
    expect(broken).toEqual([]);
  });

  it('are not left empty', () => {
    expect(Object.values(translations).filter((text) => !text.trim())).toEqual([]);
  });
});
