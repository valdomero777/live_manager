import { MAX_OVERLAY_TEMPLATES } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { SettingsRepository } from '../ports/settings-repository.js';
import { OverlayTemplateService, TemplateLimitError } from './overlay-template-service.js';

class MemorySettings implements SettingsRepository {
  readonly values = new Map<string, string>();
  get<S extends z.ZodType>(key: string, schema: S): Promise<z.infer<S> | undefined> {
    const raw = this.values.get(key);
    if (raw === undefined) return Promise.resolve(undefined);
    const parsed = schema.safeParse(JSON.parse(raw));
    return Promise.resolve(parsed.success ? parsed.data : undefined);
  }
  set(key: string, value: unknown): Promise<void> {
    this.values.set(key, JSON.stringify(value));
    return Promise.resolve();
  }
}

function service() {
  let n = 0;
  return new OverlayTemplateService(
    new MemorySettings(),
    { next: () => `tpl-${++n}` },
    { now: () => 1_000 },
  );
}

describe('OverlayTemplateService', () => {
  it('creates, updates and removes templates', async () => {
    const s = service();
    const created = await s.create({ name: ' Top regalos ', type: 'leaderboard', params: {} });
    expect(created).toEqual({
      id: 'tpl-1',
      name: 'Top regalos',
      type: 'leaderboard',
      params: {},
      pinned: false,
      updatedAt: 1_000,
    });
    const updated = await s.update('tpl-1', {
      name: 'Top likes',
      type: 'leaderboard',
      params: { metric: 'likes' },
      pinned: true,
    });
    expect(updated).toMatchObject({ id: 'tpl-1', params: { metric: 'likes' }, pinned: true });
    expect(await s.list()).toHaveLength(1);
    expect(await s.remove('tpl-1')).toBe(true);
    expect(await s.remove('tpl-1')).toBe(false);
    expect(await s.update('tpl-1', { name: 'x', type: 'stats' })).toBeUndefined();
  });

  it('keeps every template when saves overlap', async () => {
    const s = service();
    await Promise.all([
      s.create({ name: 'a', type: 'stats' }),
      s.create({ name: 'b', type: 'goal' }),
      s.create({ name: 'c', type: 'alerts' }),
    ]);
    expect((await s.list()).map((t) => t.name)).toEqual(['a', 'b', 'c']);
  });

  it('rejects templates past the limit', async () => {
    const s = service();
    for (let i = 0; i < MAX_OVERLAY_TEMPLATES; i++)
      await s.create({ name: `t${i}`, type: 'stats' });
    await expect(s.create({ name: 'extra', type: 'stats' })).rejects.toBeInstanceOf(
      TemplateLimitError,
    );
  });
});
