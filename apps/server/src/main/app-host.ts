import type { AuthService } from '../application/auth/auth-service.js';
import type { ConfigStore, StoredConfig } from '../application/ports/config-store.js';
import type { Logger } from '../application/ports/logger.js';

/** What the host needs from a configuration and from a running app. */
export interface HostConfig {
  readonly configStore: ConfigStore;
}

export interface HostedApp {
  readonly logger: Logger;
  readonly auth: AuthService;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface HostHooks {
  readonly auth?: AuthService;
  readonly requestRestart: () => void;
}

export interface AppHostDeps<C extends HostConfig> {
  load(): C;
  build(config: C, hooks: HostHooks): Promise<HostedApp>;
  /**
   * The app could not be brought back. The process must exit so its supervisor (the scheduled task
   * on Windows) starts it again: staying alive without an HTTP server would leave it unreachable.
   */
  fatal(error: unknown): void;
}

/**
 * Owns the running app. A restart requested from the settings UI rebuilds it in-process with the
 * newly saved settings; if that fails (e.g. port in use), the last working settings are
 * restored so the dashboard stays reachable. If even that fails, `fatal` ends the process.
 * Sessions survive restarts.
 */
export class AppHost<C extends HostConfig> {
  private app: HostedApp | undefined;
  private auth: AuthService | undefined;
  private restarting = false;
  /** Settings of the last successful boot, restored if a restart fails. */
  private lastGood: StoredConfig | undefined;

  constructor(private readonly deps: AppHostDeps<C>) {}

  async boot(): Promise<void> {
    const config = this.deps.load();
    const app = await this.deps.build(config, {
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
    this.lastGood = config.configStore.read();
  }

  /** Never rejects: whatever goes wrong ends in a working app or in `fatal`. */
  async restart(): Promise<void> {
    if (this.restarting || !this.app) return;
    this.restarting = true;
    try {
      await this.restartWithRollback(this.app);
    } catch (error) {
      this.app.logger.error({ err: String(error) }, 'could not restart or recover, exiting');
      this.deps.fatal(error);
    } finally {
      this.restarting = false;
    }
  }

  private async restartWithRollback(current: HostedApp): Promise<void> {
    const store = this.deps.load().configStore;
    const lastGood = this.lastGood ?? store.read();
    try {
      await current.stop();
      await this.boot();
      this.app?.logger.info({}, 'restarted with the saved settings');
    } catch (error) {
      current.logger.error({ err: String(error) }, 'restart failed, restoring previous settings');
      store.write({ ...store.read(), settings: lastGood.settings });
      await this.boot();
    }
  }

  async stop(): Promise<void> {
    await this.app?.stop();
  }

  get logger(): Logger | undefined {
    return this.app?.logger;
  }
}
