import { API_PREFIX } from '@tiklive/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './support/test-app.js';

describe('observability and backups over HTTP', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await startTestApp();
  });
  afterEach(() => t.stop());

  it('reports the full health (process, disk, alerts) with 200', async () => {
    const res = await t.api({ method: 'GET', url: `${API_PREFIX}/health` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
      process: { rssBytes: expect.any(Number), eventLoopLagMs: expect.any(Number) },
      lastBackupAt: null,
      alerts: expect.any(Array),
    });
    expect(res.json<{ diskFreePercent: number | null }>().diskFreePercent).not.toBeUndefined();
  });

  it('serves Prometheus text and counts a simulated gift', async () => {
    await t.api({
      method: 'POST',
      url: `${API_PREFIX}/simulator/emit`,
      payload: { kind: 'gift', user: 'ana', diamonds: 1, quantity: 1 },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await t.api({ method: 'GET', url: `${API_PREFIX}/metrics` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('# TYPE events_received_total counter');
    expect(res.body).toMatch(/events_received_total\{type="gift"\} \d+/);
    expect(res.body).toContain('process_rss_bytes');
    expect(res.body).toContain('connector_state{state="');
  });

  it('keeps /metrics behind the admin session', async () => {
    const res = await t.app.http.inject({ method: 'GET', url: `${API_PREFIX}/metrics` });
    expect(res.statusCode).toBe(401);
  });

  it('creates a backup on demand and lists it, and health then knows about it', async () => {
    const created = await t.api({ method: 'POST', url: `${API_PREFIX}/backups`, payload: {} });
    expect(created.statusCode).toBe(201);

    const list = await t.api({ method: 'GET', url: `${API_PREFIX}/backups` });
    expect(list.json<{ backups: { name: string }[] }>().backups.map((b) => b.name)).toContain(
      created.json<{ name: string }>().name,
    );
    const health = await t.api({ method: 'GET', url: `${API_PREFIX}/health` });
    expect(health.json<{ lastBackupAt: number | null }>().lastBackupAt).not.toBeNull();
  });
});
