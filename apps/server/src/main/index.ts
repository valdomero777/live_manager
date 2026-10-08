import { readFileSync } from 'node:fs';
import type { AuthService } from '../application/auth/auth-service.js';
import type { StoredConfig } from '../application/ports/config-store.js';
import { buildApp, type App } from './composition-root.js';
import { loadConfig } from './config.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Owns the running App. A restart requested from the settings UI rebuilds it in-process with the
 * newly saved settings; if that fails (e.g. port in use), the last working settings are
 * restored so the dashboard stays reachable. Sessions survive restarts.
 */
class AppHost {
  private app: App | undefined;
  private auth: AuthService | undefined;
  private restarting = false;
  /** Settings of the last successful boot, restored if a restart fails. */
  private lastGood: StoredConfig | undefined;

  async boot(): Promise<void> {
    const cfg = loadConfig(process.env, pkg.version);
    const app = await buildApp(cfg, {
      ...(this.auth ? { auth: this.auth } : {}),
      requestRestart: () => void this.restart(),
    });
    this.auth ??= app.auth;
    this.app = app;
    try {
      await app.start();
    } catch (error) {
      await app.stop().catch(() => undefined); // release the DB and timers of the failed boot
      throw error;
    }
    this.lastGood = cfg.configStore.read();
  }

  async restart(): Promise<void> {
    if (this.restarting || !this.app) return;
    this.restarting = true;
    const logger = this.app.logger;
    const store = loadConfig(process.env, pkg.version).configStore;
    const lastGood = this.lastGood ?? store.read();
    try {
      await this.app.stop();
      await this.boot();
      this.app.logger.info({}, 'restarted with the saved settings');
    } catch (error) {
      logger.error({ err: String(error) }, 'restart failed, restoring previous settings');
      store.write({ ...store.read(), settings: lastGood.settings });
      await this.boot();
    } finally {
      this.restarting = false;
    }
  }

  async stop(): Promise<void> {
    await this.app?.stop();
  }

  get logger() {
    return this.app?.logger;
  }
}

const host = new AppHost();

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
// Let systemd restart us on anything unexpected (spec 16: log, close, restart).
process.on('uncaughtException', (error) => {
  host.logger?.error({ err: error.stack ?? String(error) }, 'uncaught exception');
  void stop('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  host.logger?.error({ err: String(reason) }, 'unhandled rejection');
});

await host.boot();
