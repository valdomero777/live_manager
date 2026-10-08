import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_PREFIX } from '@tiklive/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTestApp, TEST_OVERLAY_KEY, TEST_PASSWORD, type TestApp } from './support/test-app.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.stop();
  t = undefined;
});

const json = <T>(res: { json: () => unknown }) => res.json() as T;

describe('dashboard authentication (RNF-07)', () => {
  it('protects the API and the admin socket but keeps health public', async () => {
    t = await startTestApp();
    const { http } = t.app;
    expect((await http.inject({ url: `${API_PREFIX}/rules` })).statusCode).toBe(401);
    expect((await http.inject({ url: `${API_PREFIX}/settings` })).statusCode).toBe(401);
    expect((await http.inject({ url: `${API_PREFIX}/health` })).statusCode).toBe(200);
    expect((await t.api({ url: `${API_PREFIX}/rules` })).statusCode).toBe(200);
    await expect(http.injectWS('/ws/admin')).rejects.toThrow();
  });

  it('locks an IP out after 5 wrong passwords', async () => {
    t = await startTestApp();
    const attempt = (password: string) =>
      t!.app.http.inject({
        method: 'POST',
        url: `${API_PREFIX}/auth/login`,
        payload: { password },
      });
    for (let i = 0; i < 5; i++) expect((await attempt('wrong-pass')).statusCode).toBe(401);
    expect((await attempt(TEST_PASSWORD)).statusCode).toBe(429);
  });

  it('rejects cross-origin writes even with a valid session', async () => {
    t = await startTestApp();
    const res = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/queue/clear`,
      headers: { origin: 'http://evil.example' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('first run: the password is created with the one-time setup code', async () => {
    t = await startTestApp({ ADMIN_PASSWORD_HASH: '' });
    const { http, auth } = t.app;
    const status = await http.inject({ url: `${API_PREFIX}/auth/status` });
    expect(status.json()).toEqual({ authenticated: false, setupRequired: true });

    const setup = (code: string) =>
      http.inject({
        method: 'POST',
        url: `${API_PREFIX}/auth/setup`,
        payload: { code, password: 'nueva-clave-1' },
      });
    expect((await setup('WRONGCODE')).statusCode).toBe(401);
    const code = auth.prepareSetup()!;
    const ok = await setup(code.toLowerCase());
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(ok.headers['set-cookie'])).toContain('SameSite=Strict');
    expect((await setup(code)).statusCode).toBe(409);
    const saved = JSON.parse(readFileSync(join(t.dir, 'config.json'), 'utf8')) as {
      adminPasswordHash?: string;
    };
    expect(saved.adminPasswordHash).toMatch(/^\$argon2id\$/);
  });

  it('changing the password signs out other sessions', async () => {
    t = await startTestApp();
    const changed = await t.api({
      method: 'POST',
      url: `${API_PREFIX}/auth/password`,
      payload: { current: TEST_PASSWORD, next: 'otra-clave-123' },
    });
    expect(changed.statusCode).toBe(204);
    expect((await t.api({ url: `${API_PREFIX}/rules` })).statusCode).toBe(401);
  });
});

describe('settings from the UI', () => {
  type View = {
    fields: Record<string, { value?: unknown; source: string; pendingRestart: boolean }>;
    restartPending: boolean;
  };
  type Update = View & { applied: string[]; restartRequired: string[] };

  it('shows every setting with its source and never returns secrets', async () => {
    t = await startTestApp({ TIKTOK_SIGN_API_KEY: 'super-secret' });
    const view = json<View>(await t.api({ url: `${API_PREFIX}/settings` }));
    expect(Object.keys(view.fields).sort()).toEqual(
      [
        'assetsDir',
        'dbPath',
        'host',
        'logLevel',
        'overlayKey',
        'overlaysDir',
        'port',
        'signApiKey',
        'simulate',
        'tiktokUsername',
      ].sort(),
    );
    expect(view.fields['overlayKey']).toMatchObject({ value: TEST_OVERLAY_KEY, source: 'env' });
    expect(view.fields['tiktokUsername']).toMatchObject({ source: 'default' });
    expect(view.fields['signApiKey']).toMatchObject({ source: 'env', isSet: true });
    expect(view.fields['signApiKey']).not.toHaveProperty('value');
    expect(JSON.stringify(view)).not.toContain('super-secret');
  });

  it('applies live settings at once and flags restart settings, persisting both', async () => {
    t = await startTestApp();
    const res = await t.api({
      method: 'PATCH',
      url: `${API_PREFIX}/settings`,
      payload: { logLevel: 'debug', port: 4321 },
    });
    const update = json<Update>(res);
    expect(update.applied).toEqual(['logLevel']);
    expect(update.restartRequired).toEqual(['port']);
    expect(update.fields['logLevel']).toMatchObject({
      value: 'debug',
      source: 'ui',
      pendingRestart: false,
    });
    expect(update.fields['port']).toMatchObject({ value: 4321, pendingRestart: true });
    expect(update.restartPending).toBe(true);
    const file = JSON.parse(readFileSync(join(t.dir, 'config.json'), 'utf8')) as {
      settings: object;
    };
    expect(file.settings).toMatchObject({ logLevel: 'debug', port: 4321 });

    const reverted = json<Update>(
      await t.api({ method: 'PATCH', url: `${API_PREFIX}/settings`, payload: { port: null } }),
    );
    expect(reverted.fields['port']).toMatchObject({ source: 'env', pendingRestart: false });
  });

  it('rejects invalid values with problem+json', async () => {
    t = await startTestApp();
    const res = await t.api({
      method: 'PATCH',
      url: `${API_PREFIX}/settings`,
      payload: { port: 'abc', nope: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('a new overlay key revokes the old overlay URLs immediately', async () => {
    t = await startTestApp();
    const rotated = json<Update>(
      await t.api({ method: 'POST', url: `${API_PREFIX}/settings/overlay-key/rotate` }),
    );
    const newKey = String(rotated.fields['overlayKey']?.value);
    expect(newKey).not.toBe(TEST_OVERLAY_KEY);
    expect(rotated.applied).toEqual(['overlayKey']);
    const old = await t.app.http.inject({
      url: `/overlay-data/rotators/main?key=${TEST_OVERLAY_KEY}`,
    });
    const fresh = await t.app.http.inject({ url: `/overlay-data/rotators/main?key=${newKey}` });
    expect(old.statusCode).toBe(401);
    expect(fresh.statusCode).toBe(200);
  });

  it('restart is delegated to the host', async () => {
    const requestRestart = vi.fn();
    t = await startTestApp({}, { requestRestart });
    const res = await t.api({ method: 'POST', url: `${API_PREFIX}/settings/restart` });
    expect(res.statusCode).toBe(202);
    await vi.waitFor(() => expect(requestRestart).toHaveBeenCalledOnce());
  });

  it('TTS moderation is editable and validated', async () => {
    t = await startTestApp();
    const current = await t.api({ url: `${API_PREFIX}/settings/moderation` });
    expect(current.json()).toMatchObject({ maxLength: 150, blockedTerms: [] });
    const saved = await t.api({
      method: 'PUT',
      url: `${API_PREFIX}/settings/moderation`,
      payload: { ...current.json<object>(), blockedTerms: ['feo'], maxLength: 80 },
    });
    expect(saved.json()).toMatchObject({ blockedTerms: ['feo'], maxLength: 80 });
    const invalid = await t.api({
      method: 'PUT',
      url: `${API_PREFIX}/settings/moderation`,
      payload: { maxLength: 1 },
    });
    expect(invalid.statusCode).toBe(400);
  });
});

describe('content security policy', () => {
  it('allows this host on any port (restart onto a new port) and rejects odd hosts', async () => {
    const { contentSecurityPolicy } = await import('../src/interface/http/build-http-server.js');
    expect(contentSecurityPolicy('192.168.0.10:3000')).toContain(
      "connect-src 'self' ws: wss: http://192.168.0.10:* https://192.168.0.10:*;",
    );
    expect(contentSecurityPolicy('evil.com; script-src *')).toContain(
      "connect-src 'self' ws: wss:;",
    );
    expect(contentSecurityPolicy(undefined)).not.toContain('http://');
  });
});
