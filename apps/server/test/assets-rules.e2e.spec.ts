import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { API_PREFIX, type Asset, type RuleTestResult } from '@tiklive/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { detectMediaType } from '../src/domain/assets/media-type.js';
import { generateDing } from '../src/main/ding.js';
import { startTestApp, type TestApp } from './support/test-app.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.stop();
  t = undefined;
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(app: TestApp, name: string, content: Uint8Array) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return app.api({ method: 'POST', url: `${API_PREFIX}/assets`, payload: form });
}

describe('detectMediaType', () => {
  it('recognises formats by content, not by name', () => {
    expect(detectMediaType(generateDing())).toEqual({ kind: 'audio', ext: 'wav' });
    expect(detectMediaType(PNG)).toEqual({ kind: 'image', ext: 'png' });
    expect(detectMediaType(new TextEncoder().encode('ID3\x04rest'))).toEqual({
      kind: 'audio',
      ext: 'mp3',
    });
    expect(detectMediaType(new TextEncoder().encode('<script>alert(1)</script>'))).toBeUndefined();
  });
});

describe('asset library (RF-19)', () => {
  it('uploads, deduplicates, serves and deletes an unused asset', async () => {
    t = await startTestApp();
    const first = await upload(t, 'ding.wav', generateDing());
    expect(first.statusCode).toBe(201);
    const asset = first.json<Asset>();
    expect(asset).toMatchObject({ kind: 'audio', originalName: 'ding.wav' });
    expect(asset.url).toMatch(/^\/media\/[0-9a-f]{16}\.wav$/);

    const again = await upload(t, 'otro-nombre.wav', generateDing());
    expect(again.json<Asset>().id).toBe(asset.id);
    expect((await t.api({ url: `${API_PREFIX}/assets` })).json<Asset[]>()).toHaveLength(1);
    expect((await t.app.http.inject({ url: asset.url })).statusCode).toBe(200);

    const file = join(t.dir, 'assets', asset.url.replace('/media/', ''));
    expect(existsSync(file)).toBe(true);
    expect(
      (await t.api({ method: 'DELETE', url: `${API_PREFIX}/assets/${asset.id}` })).statusCode,
    ).toBe(204);
    expect(existsSync(file)).toBe(false);
  });

  it('rejects unsupported content even with a media extension', async () => {
    t = await startTestApp();
    const res = await upload(t, 'falso.mp3', new TextEncoder().encode('<html>no</html>'));
    expect(res.statusCode).toBe(415);
  });

  it('refuses to delete an asset used by a rule', async () => {
    t = await startTestApp();
    const asset = (await upload(t, 'ding.wav', generateDing())).json<Asset>();
    await t.api({
      method: 'POST',
      url: `${API_PREFIX}/rules`,
      payload: {
        name: 'Con sonido',
        trigger: 'gift',
        actions: [{ type: 'playSound', assetId: asset.id }],
      },
    });
    const res = await t.api({ method: 'DELETE', url: `${API_PREFIX}/assets/${asset.id}` });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ title: string }>().title).toContain('Con sonido');
  });
});

describe('rule test (POST /rules/:id/test)', () => {
  it('explains each condition and queues actions only when all hold', async () => {
    t = await startTestApp();
    const rule = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/rules`,
      payload: {
        name: 'Rosas',
        trigger: 'gift',
        cooldownMs: 60_000,
        conditions: [
          { type: 'giftName', op: 'eq', value: 'Rose' },
          { type: 'quantity', op: 'gte', value: 10 },
        ],
        actions: [{ type: 'showAlert', text: '{nickname} x{quantity}' }],
      },
    });
    const id = rule.json<{ id: number }>().id;
    const test = (body: object) =>
      t!.api({ method: 'POST', url: `${API_PREFIX}/rules/${id}/test`, payload: body });

    const miss = (await test({ quantity: 3 })).json<RuleTestResult>();
    expect(miss).toEqual({
      matched: false,
      conditions: [
        { type: 'giftName', ok: true },
        { type: 'quantity', ok: false },
      ],
      actionsQueued: 0,
      actionsSkipped: 0,
    });
    const hit = (await test({ quantity: 10 })).json<RuleTestResult>();
    expect(hit).toMatchObject({ matched: true, actionsQueued: 1 });
    // A second test right away ignores the 60 s cooldown on purpose.
    expect((await test({ quantity: 10 })).json<RuleTestResult>().actionsQueued).toBe(1);
    expect(
      (await t.api({ method: 'POST', url: `${API_PREFIX}/rules/999/test`, payload: {} }))
        .statusCode,
    ).toBe(404);
  });
});

describe('recent events (GET /events/recent)', () => {
  it('returns the current session events newest first, re-validated', async () => {
    t = await startTestApp();
    const emit = (payload: object) =>
      t!.api({ method: 'POST', url: `${API_PREFIX}/simulator/emit`, payload });
    await emit({ kind: 'comment', user: 'ana', text: 'primero' });
    await emit({ kind: 'follow', user: 'leo' });
    await t.app.http.inject({ url: `${API_PREFIX}/health` });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const res = await t.api({ url: `${API_PREFIX}/events/recent?limit=10` });
    expect(res.json<{ type: string }[]>().map((e) => e.type)).toEqual(['follow', 'comment']);
    expect((await t.app.http.inject({ url: `${API_PREFIX}/events/recent` })).statusCode).toBe(401);
  });
});
