import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_PREFIX } from '@tiklive/contracts';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { Argon2Hasher } from '../../src/infrastructure/auth/argon2-hasher.js';
import { buildApp, type App, type AppHooks } from '../../src/main/composition-root.js';
import { loadConfig } from '../../src/main/config.js';

export const TEST_OVERLAY_KEY = 'test-overlay-key';
export const TEST_PASSWORD = 'test-password';

let cachedHash: Promise<string> | undefined;
const passwordHash = () => (cachedHash ??= new Argon2Hasher().hash(TEST_PASSWORD));

export interface TestApp {
  readonly app: App;
  readonly dir: string;
  /** inject() carrying the admin session cookie. */
  api(options: InjectOptions): Promise<LightMyRequestResponse>;
  readonly cookie: string;
  stop(): Promise<void>;
}

/** Full app on an in-memory DB and a temp config dir, already logged in as admin. */
export async function startTestApp(
  env: Record<string, string> = {},
  hooks: AppHooks = {},
): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'tiklive-'));
  const cfg = loadConfig(
    {
      DB_PATH: ':memory:',
      CONFIG_PATH: join(dir, 'config.json'),
      ASSETS_DIR: join(dir, 'assets'),
      OVERLAYS_DIR: join(dir, 'none'),
      DASHBOARD_DIR: join(dir, 'none'),
      OVERLAY_KEY: TEST_OVERLAY_KEY,
      SIMULATE: 'true',
      LOG_LEVEL: 'fatal',
      PORT: '0',
      HOST: '127.0.0.1',
      ADMIN_PASSWORD_HASH: await passwordHash(),
      ...env,
    },
    'test',
  );
  const app = await buildApp(cfg, hooks);
  await app.start();
  const login = await app.http.inject({
    method: 'POST',
    url: `${API_PREFIX}/auth/login`,
    payload: { password: TEST_PASSWORD },
  });
  const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
  return {
    app,
    dir,
    cookie,
    api: (options) => app.http.inject({ ...options, headers: { ...options.headers, cookie } }),
    stop: async () => {
      await app.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
