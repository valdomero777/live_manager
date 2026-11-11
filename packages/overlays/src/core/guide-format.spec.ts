import { describe, expect, it } from 'vitest';
import { describeAction, describeCost } from './guide-format.js';

describe('gift guide formatting', () => {
  it('names each kind of reaction and quotes the text when there is one', () => {
    expect(describeAction({ kind: 'sound' })).toBe('🔊 Sonido');
    expect(describeAction({ kind: 'speech', text: 'Gracias' })).toBe('🗣 Voz: «Gracias»');
    expect(describeAction({ kind: 'alert' })).toBe('🔔 Alerta');
  });

  it('shows no price when the catalog did not provide one', () => {
    expect(describeCost(undefined)).toBe('');
    expect(describeCost(1)).toContain('1');
  });
});
