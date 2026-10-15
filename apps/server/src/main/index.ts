import { readFileSync } from 'node:fs';
import { AppHost } from './app-host.js';
import { buildApp } from './composition-root.js';
import { loadConfig } from './config.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const host = new AppHost({
  load: () => loadConfig(process.env, pkg.version),
  build: buildApp,
  fatal: () => process.exit(1),
});

let stopping = false;
async function stop(signal: string, exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  host.logger?.info({ signal }, 'signal received');
  try {
    await host.stop();
    process.exit(exitCode);
  } catch (error) {
    host.logger?.error({ err: String(error) }, 'shutdown failed');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
// Exit on anything unexpected and let the supervisor restart us (the scheduled task on Windows).
process.on('uncaughtException', (error) => {
  host.logger?.error({ err: error.stack ?? String(error) }, 'uncaught exception');
  void stop('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  host.logger?.error({ err: String(reason) }, 'unhandled rejection');
});

await host.boot();
