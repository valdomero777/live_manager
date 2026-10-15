import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { E2E_OVERLAY_KEY, E2E_PASSWORD, E2E_PORT } from './settings.js';

/**
 * Starts the built server on throw-away data (database, config, assets, backups) with the
 * simulator as the live source and a known panel password, so the dashboard tests start from a
 * clean, reproducible state. Run `npm run build` first.
 */
async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'tiklive-e2e-'));
  const entry = resolve(import.meta.dirname, '../apps/server/dist/main/index.js');
  const server = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(E2E_PORT),
      HOST: '127.0.0.1',
      SIMULATE: 'true',
      TIKTOK_USERNAME: '',
      LOG_LEVEL: 'warn',
      OVERLAY_KEY: E2E_OVERLAY_KEY,
      ADMIN_PASSWORD_HASH: await hash(E2E_PASSWORD),
      CONFIG_PATH: join(dir, 'config.json'),
      DB_PATH: join(dir, 'app.db'),
      ASSETS_DIR: join(dir, 'assets'),
      BACKUP_DIR: join(dir, 'backups'),
    },
  });
  const stop = (): void => {
    server.kill('SIGTERM');
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  server.on('exit', (code) => {
    rmSync(dir, { recursive: true, force: true });
    process.exit(code ?? 0);
  });
}

void main();
