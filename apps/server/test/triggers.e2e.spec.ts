import {
  API_PREFIX,
  ScreenServerMessageSchema,
  type ScreenServerMessage,
  type SoundSearchResult,
  type Trigger,
} from '@tiklive/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { SoundSourceError, type SoundProvider } from '../src/application/ports/sound-provider.js';
import { startTestApp, TEST_OVERLAY_KEY as KEY, type TestApp } from './support/test-app.js';

const VINE = {
  id: 'vine-boom-sound-70972',
  title: 'VINE BOOM SOUND',
  pageUrl: 'https://www.myinstants.com/en/instant/vine-boom-sound-70972/',
  audioUrl: 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
  source: 'myinstants' as const,
};

const DEFINITION = {
  name: 'Nuevo seguidor',
  event: 'follow',
  soundId: VINE.id,
  soundTitle: VINE.title,
  soundUrl: VINE.audioUrl,
  soundPageUrl: VINE.pageUrl,
  source: 'myinstants',
  volume: 0.8,
  enabled: true,
};

/** Connects as the audio screen; resolves the next action.play_sound or rejects on timeout. */
function connectAudio(ws: WebSocket, timeoutMs = 1_500) {
  const messages: ScreenServerMessage[] = [];
  ws.on('message', (raw: Buffer) =>
    messages.push(ScreenServerMessageSchema.parse(JSON.parse(raw.toString()))),
  );
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'client.hello',
      ts: Date.now(),
      payload: { screenId: 'audio', clientVersion: 't', subscriptions: [] },
    }),
  );
  return async () => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = messages.find((m) => m.type === 'action.play_sound');
      if (found) {
        messages.splice(messages.indexOf(found), 1);
        return found;
      }
      if (Date.now() > deadline) throw new Error('timeout waiting for action.play_sound');
      await new Promise((r) => setTimeout(r, 25));
    }
  };
}

describe('sound triggers (MyInstants, remote URL only)', () => {
  let t: TestApp;
  let searches: string[];
  let failing: boolean;

  beforeEach(async () => {
    searches = [];
    failing = false;
    const soundProvider: SoundProvider = {
      search: (query, page): Promise<SoundSearchResult> => {
        searches.push(query);
        if (failing) return Promise.reject(new SoundSourceError('down'));
        return Promise.resolve({ query, page, hasNext: false, results: [VINE] });
      },
    };
    t = await startTestApp({}, { soundProvider });
  });
  afterEach(() => t.stop());

  const create = (payload: object = DEFINITION) =>
    t.api({ method: 'POST', url: `${API_PREFIX}/triggers`, payload });

  it('searches through our API and caches repeated queries', async () => {
    const url = `${API_PREFIX}/sounds/search?q=vine%20boom`;
    const first = await t.api({ url });
    expect(first.statusCode).toBe(200);
    expect(first.json<SoundSearchResult>().results).toEqual([VINE]);
    await t.api({ url });
    expect(searches).toHaveLength(1);
    expect((await t.api({ url: `${API_PREFIX}/sounds/search` })).statusCode).toBe(400);
  });

  it('hides provider failures behind a friendly message', async () => {
    failing = true;
    const res = await t.api({ url: `${API_PREFIX}/sounds/search?q=boom` });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      title: 'No se pudieron cargar los sonidos. Intenta nuevamente.',
    });
    expect(res.body).not.toContain('down');
  });

  it('requires the admin session', async () => {
    const res = await t.app.http.inject({ url: `${API_PREFIX}/triggers` });
    expect(res.statusCode).toBe(401);
  });

  it('creates, reads, updates and deletes a trigger', async () => {
    const created = await create();
    expect(created.statusCode).toBe(201);
    const trigger = created.json<Trigger>();
    expect(trigger).toMatchObject({ ...DEFINITION, enabled: true });
    expect(trigger.createdAt).toBe(trigger.updatedAt);

    expect((await t.api({ url: `${API_PREFIX}/triggers` })).json<Trigger[]>()).toHaveLength(1);
    expect((await t.api({ url: `${API_PREFIX}/triggers/${trigger.id}` })).json()).toMatchObject({
      name: 'Nuevo seguidor',
    });

    const updated = await t.api({
      method: 'PUT',
      url: `${API_PREFIX}/triggers/${trigger.id}`,
      payload: { ...DEFINITION, name: 'Otro', volume: 0.3, enabled: false },
    });
    expect(updated.json<Trigger>()).toMatchObject({ name: 'Otro', volume: 0.3, enabled: false });

    const missing = await t.api({
      method: 'PUT',
      url: `${API_PREFIX}/triggers/999`,
      payload: DEFINITION,
    });
    expect(missing.statusCode).toBe(404);

    expect(
      (await t.api({ method: 'DELETE', url: `${API_PREFIX}/triggers/${trigger.id}` })).statusCode,
    ).toBe(204);
    expect(
      (await t.api({ method: 'DELETE', url: `${API_PREFIX}/triggers/${trigger.id}` })).statusCode,
    ).toBe(404);
  });

  it('validates the payload: volume range, required fields and allowed sound hosts', async () => {
    expect((await create({ ...DEFINITION, volume: 1.5 })).statusCode).toBe(400);
    expect((await create({ ...DEFINITION, volume: -0.1 })).statusCode).toBe(400);
    expect((await create({ ...DEFINITION, name: '  ' })).statusCode).toBe(400);
    expect((await create({ ...DEFINITION, event: 'nope' })).statusCode).toBe(400);
    expect((await create({ ...DEFINITION, soundUrl: '' })).statusCode).toBe(400);
    expect((await create({ ...DEFINITION, enabled: 'yes' })).statusCode).toBe(400);
    const foreign = await create({ ...DEFINITION, soundUrl: 'https://evil.example/a.mp3' });
    expect(foreign.statusCode).toBe(400);
  });

  it('delivers the saved URL to the audio screen when the event happens', async () => {
    const ws = await t.app.http.injectWS(`/ws/screen/audio?key=${KEY}`);
    const nextSound = connectAudio(ws);
    await create();

    await t.api({
      method: 'POST',
      url: `${API_PREFIX}/simulator/emit`,
      payload: { kind: 'follow', user: 'ana' },
    });
    const sound = await nextSound();
    expect(sound.payload).toMatchObject({ url: VINE.audioUrl, volume: 0.8 });
    expect(sound.payload.triggerId).toBeGreaterThan(0);
    expect(searches).toHaveLength(0); // no provider lookup when an event fires
    ws.terminate();
  });

  it('does not fire a disabled trigger, but the test endpoint still plays it', async () => {
    const ws = await t.app.http.injectWS(`/ws/screen/audio?key=${KEY}`);
    const nextSound = connectAudio(ws);
    const { id } = (await create({ ...DEFINITION, enabled: false })).json<Trigger>();

    await t.api({
      method: 'POST',
      url: `${API_PREFIX}/simulator/emit`,
      payload: { kind: 'follow', user: 'ana' },
    });
    await expect(nextSound()).rejects.toThrow('timeout');

    const test = await t.api({ method: 'POST', url: `${API_PREFIX}/triggers/${id}/test` });
    expect(test.json()).toEqual({ status: 'queued' });
    expect((await nextSound()).payload.url).toBe(VINE.audioUrl);
    expect(
      (await t.api({ method: 'POST', url: `${API_PREFIX}/triggers/999/test` })).statusCode,
    ).toBe(404);
    ws.terminate();
  });
});
