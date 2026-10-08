import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../src/domain/shared/time.js';
import { JsonConfigStore } from '../src/infrastructure/config/json-config-store.js';
import { DEFAULT_SETTINGS, loadConfig } from '../src/main/config.js';
import {
  AuthError,
  AuthService,
  MAX_FAILED_LOGINS,
  SESSION_IDLE_MS,
} from '../src/application/auth/auth-service.js';
import type { ConfigStore, StoredConfig } from '../src/application/ports/config-store.js';
import { silentLogger } from '../src/application/ports/logger.js';
import { resolveSettings } from '../src/application/settings/resolve-settings.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tiklive-cfg-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

class MemoryStore implements ConfigStore {
  readonly location = 'memory';
  constructor(private config: StoredConfig = { settings: {} }) {}
  read(): StoredConfig {
    return this.config;
  }
  write(config: StoredConfig): void {
    this.config = config;
  }
}

describe('resolveSettings', () => {
  it('uses UI value over env over default, reporting the source', () => {
    const resolved = resolveSettings(
      DEFAULT_SETTINGS,
      { port: 4000, logLevel: 'warn' },
      { port: 5000 },
    );
    expect(resolved.values).toMatchObject({ port: 5000, logLevel: 'warn', host: '0.0.0.0' });
    expect(resolved.sources).toMatchObject({ port: 'ui', logLevel: 'env', host: 'default' });
  });
});

describe('JsonConfigStore', () => {
  it('round-trips and skips individually invalid values', () => {
    const path = join(tempDir(), 'config.json');
    const invalid: string[] = [];
    const store = new JsonConfigStore(path, (k) => invalid.push(k));
    expect(store.read()).toEqual({ settings: {} });
    store.write({ settings: { port: 4000, logLevel: 'debug' }, adminPasswordHash: 'h' });
    expect(store.read()).toEqual({
      settings: { port: 4000, logLevel: 'debug' },
      adminPasswordHash: 'h',
    });

    writeFileSync(path, JSON.stringify({ version: 1, settings: { port: 'nope', host: 'x' } }));
    expect(store.read().settings).toEqual({ host: 'x' });
    expect(invalid).toEqual(['port']);
  });
});

describe('loadConfig', () => {
  it('ignores invalid env values with a warning instead of failing to boot', () => {
    const dir = tempDir();
    const cfg = loadConfig({ CONFIG_PATH: join(dir, 'c.json'), PORT: 'abc', SIMULATE: '1' }, 't');
    expect(cfg.port).toBe(3000);
    expect(cfg.simulate).toBe(true);
    expect(cfg.warnings).toEqual(['PORT no es válido y se ignora']);
  });

  it('generates and persists an overlay key on a fresh install', () => {
    const path = join(tempDir(), 'c.json');
    const first = loadConfig({ CONFIG_PATH: path }, 't');
    expect(first.overlayKey.length).toBeGreaterThanOrEqual(16);
    expect(loadConfig({ CONFIG_PATH: path }, 't').overlayKey).toBe(first.overlayKey);
    expect(readFileSync(path, 'utf8')).toContain(first.overlayKey);
  });

  it('UI-saved values override environment variables', () => {
    const path = join(tempDir(), 'c.json');
    new JsonConfigStore(path).write({ settings: { tiktokUsername: 'desde_ui', port: 4100 } });
    const cfg = loadConfig({ CONFIG_PATH: path, TIKTOK_USERNAME: 'desde_env', PORT: '3000' }, 't');
    expect(cfg.tiktokUsername).toBe('desde_ui');
    expect(cfg.port).toBe(4100);
  });
});

describe('AuthService', () => {
  const hasher = {
    hash: async (p: string) => `hash:${p}`,
    verify: async (h: string, p: string) => h === `hash:${p}`,
  };
  let n = 0;
  const secrets = { token: () => `t${++n}`, code: () => 'ABCD2345' };

  function setup(store = new MemoryStore({ settings: {}, adminPasswordHash: 'hash:secreto' })) {
    const clock = new FakeClock(0);
    const auth = new AuthService({
      store,
      envPasswordHash: undefined,
      hasher,
      secrets,
      clock,
      logger: silentLogger,
    });
    return { auth, clock, store };
  }

  it('sessions expire after the idle timeout and slide while used', async () => {
    const { auth, clock } = setup();
    const token = await auth.login('secreto', 'ip');
    clock.advance(SESSION_IDLE_MS - 1);
    expect(auth.validate(token)).toBe(true);
    clock.advance(SESSION_IDLE_MS - 1);
    expect(auth.validate(token)).toBe(true);
    clock.advance(SESSION_IDLE_MS + 1);
    expect(auth.validate(token)).toBe(false);
  });

  it('locks only the offending IP', async () => {
    const { auth } = setup();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await expect(auth.login('mal', 'a')).rejects.toThrow(AuthError);
    }
    await expect(auth.login('secreto', 'a')).rejects.toMatchObject({ code: 'locked' });
    await expect(auth.login('secreto', 'b')).resolves.toBeTypeOf('string');
  });

  it('a UI-saved password hash takes precedence and setup is offered only without one', async () => {
    const { auth } = setup(new MemoryStore());
    expect(auth.status(undefined)).toEqual({ authenticated: false, setupRequired: true });
    const token = await auth.setup(auth.prepareSetup()!, 'nueva-clave');
    expect(auth.validate(token)).toBe(true);
    expect(auth.prepareSetup()).toBeUndefined();
    await expect(auth.setup('ABCD2345', 'x-y-z-123')).rejects.toMatchObject({
      code: 'already_set',
    });
  });
});
