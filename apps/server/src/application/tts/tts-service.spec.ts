import { TtsSettingsSchema, type Scope, type TtsVoiceInfo } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import { MemorySettings } from '../../../test/support/fakes.js';
import { FakeClock } from '../../domain/shared/time.js';
import { silentLogger } from '../ports/logger.js';
import type { SynthesisRequest } from '../ports/speech-synthesizer.js';
import { TOP_GIFTERS_TTL_MS, TTS_SETTINGS_KEY, TtsService, VOICES_TTL_MS } from './tts-service.js';

const VOICES: TtsVoiceInfo[] = [
  { name: 'es-MX-DaliaNeural', displayName: 'Dalia', locale: 'es-MX', gender: 'female' },
  { name: 'es-MX-JorgeNeural', displayName: 'Jorge', locale: 'es-MX', gender: 'male' },
];

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const clock = new FakeClock(0);
  const repo = new MemorySettings();
  const requests: SynthesisRequest[] = [];
  const synth = {
    listCalls: 0,
    failNext: false,
    async listVoices() {
      synth.listCalls++;
      if (synth.failNext) {
        synth.failNext = false;
        throw new Error('down');
      }
      return VOICES;
    },
    async synthesize(request: SynthesisRequest) {
      requests.push(request);
      return new Uint8Array([1, 2, 3]);
    },
  };
  const ranking = { ids: ['Ana'], calls: [] as Scope[] };
  const service = new TtsService({
    repo,
    synthesizer: synth,
    scoreLanguages: () => [['es', 1]],
    topGifters: async (scope) => {
      ranking.calls.push(scope);
      return ranking.ids;
    },
    clock,
    logger: silentLogger,
  });
  return { service, clock, repo, synth, requests, ranking };
}

describe('TtsService', () => {
  it('loads stored settings and saves updates', async () => {
    const { service, repo } = setup();
    repo.values.set(TTS_SETTINGS_KEY, { voice: { gender: 'male' } });
    await service.load();
    expect(service.get().voice.gender).toBe('male');
    expect(service.get().audience.everyone).toBe(true);

    const next = TtsSettingsSchema.parse({ voice: { engine: 'edge' } });
    await service.update(next);
    expect(repo.values.get(TTS_SETTINGS_KEY)).toEqual(next);
    expect(service.voice()).toMatchObject({ engine: 'edge', lang: 'es-MX' });
  });

  it('only sends a voice name when one is configured', async () => {
    const { service } = setup();
    expect(service.voice()).not.toHaveProperty('voiceName');
    await service.update(TtsSettingsSchema.parse({ voice: { voiceName: 'es-MX-JorgeNeural' } }));
    expect(service.voice().voiceName).toBe('es-MX-JorgeNeural');
  });

  it('top gifters: first lookup misses and refreshes; later ones use the cache until the TTL', async () => {
    const { service, clock, ranking } = setup();
    expect(service.isTop('ana', 3, 'session')).toBe(false);
    await flush();
    expect(service.isTop('ANA', 3, 'session')).toBe(true);
    expect(ranking.calls).toEqual(['session']);

    ranking.ids = ['beto', 'ana'];
    clock.advance(TOP_GIFTERS_TTL_MS);
    expect(service.isTop('ana', 1, 'session')).toBe(true); // stale answer while refreshing
    await flush();
    expect(service.isTop('ana', 1, 'session')).toBe(false);
    expect(service.isTop('ana', 2, 'session')).toBe(true);
  });

  it('warms the ranking when top gifters are enabled', async () => {
    const { service, ranking } = setup();
    await service.update(
      TtsSettingsSchema.parse({ audience: { topGifters: { enabled: true, scope: 'week' } } }),
    );
    await flush();
    expect(ranking.calls).toEqual(['week']);
  });

  it('caches the voice catalogue, but not a failure', async () => {
    const { service, synth, clock } = setup();
    synth.failNext = true;
    await expect(service.voices()).rejects.toThrow('down');
    expect(await service.voices()).toEqual(VOICES);
    await service.voices();
    expect(synth.listCalls).toBe(2);
    clock.advance(VOICES_TTL_MS);
    await service.voices();
    expect(synth.listCalls).toBe(3);
  });

  it('synthesize resolves the voice by name, or by language and gender', async () => {
    const { service, requests } = setup();
    await service.synthesize({ text: 'hola', lang: 'es-MX', gender: 'male' });
    await service.synthesize({
      text: 'hola',
      lang: 'es-MX',
      gender: 'male',
      voice: 'es-MX-DaliaNeural',
      rate: 1.5,
    });
    expect(requests).toEqual([
      { text: 'hola', voice: 'es-MX-JorgeNeural' },
      { text: 'hola', voice: 'es-MX-DaliaNeural', rate: 1.5 },
    ]);
  });

  it('an unknown browser voice name falls back to language and gender', async () => {
    const { service, requests } = setup();
    await service.synthesize({
      text: 'x',
      lang: 'es-MX',
      gender: 'female',
      voice: 'Microsoft Sabina',
    });
    expect(requests[0]?.voice).toBe('es-MX-DaliaNeural');
  });

  it('fails clearly when no voice speaks the language', async () => {
    const { service } = setup();
    await expect(service.synthesize({ text: 'x', lang: 'ja', gender: 'any' })).rejects.toThrow(
      /ja/,
    );
  });
});
