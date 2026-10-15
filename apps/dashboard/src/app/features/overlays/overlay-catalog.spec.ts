import { OVERLAY_TEMPLATE_TYPES } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import {
  OVERLAY_PRESETS,
  OVERLAY_TYPES,
  buildOverlayUrl,
  linesToValue,
  valueToLines,
} from './overlay-catalog';

describe('overlay presets', () => {
  it('only use overlay types that can be saved as templates', () => {
    for (const preset of OVERLAY_PRESETS) {
      expect(OVERLAY_TEMPLATE_TYPES as readonly string[], preset.id).toContain(preset.type);
    }
  });

  it('only set parameters the overlay type declares', () => {
    for (const preset of OVERLAY_PRESETS) {
      const type = OVERLAY_TYPES.find((t) => t.id === preset.type);
      const keys = new Set(type?.params.map((p) => p.key));
      for (const key of Object.keys(preset.params))
        expect(keys.has(key), `${preset.id}.${key}`).toBe(true);
    }
  });

  it('have unique ids', () => {
    const ids = OVERLAY_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('list parameters', () => {
  it('round-trip one item per line and drop blank lines', () => {
    expect(linesToValue('uno\n\n dos \r\ntres')).toBe('uno|dos|tres');
    expect(valueToLines('uno|dos')).toBe('uno\ndos');
  });

  it('never let a "|" typed by the user split an item', () => {
    expect(linesToValue('a|b')).toBe('a b');
  });

  it('are encoded in the overlay URL', () => {
    const ticker = OVERLAY_TYPES.find((t) => t.id === 'ticker');
    if (!ticker) throw new Error('ticker type missing');
    const url = buildOverlayUrl(ticker, { messages: linesToValue('Hola\nAdiós') }, 'k', 'http://x');
    expect(new URL(url).searchParams.get('messages')).toBe('Hola|Adiós');
  });
});
