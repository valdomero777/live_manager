import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../application/auth/auth-service.js';
import type { ConfigStore, StoredConfig } from '../application/ports/config-store.js';
import type { Logger } from '../application/ports/logger.js';
import { AppHost, type HostConfig, type HostHooks, type HostedApp } from './app-host.js';

const logger = (): Logger => {
  const l: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => l,
  };
  return l;
};

class MemoryStore implements ConfigStore {
  readonly location = 'memory';
  config: StoredConfig = { settings: { port: 3000 } };
  read(): StoredConfig {
    return this.config;
  }
  write(config: StoredConfig): void {
    this.config = config;
  }
}

interface Fake {
  app: HostedApp;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

const auth = {} as AuthService;

function fakeApp(startFails = false): Fake {
  const start = vi.fn(() =>
    startFails ? Promise.reject(new Error('port in use')) : Promise.resolve(),
  );
  const stop = vi.fn(() => Promise.resolve());
  return { app: { logger: logger(), auth, start, stop }, start, stop };
}

/** A host whose builds follow `builds` in order; `load` can be made to fail. */
function setup(builds: Fake[], loadError?: () => Error | undefined) {
  const store = new MemoryStore();
  const hooks: HostHooks[] = [];
  const fatal = vi.fn();
  let next = 0;
  const host = new AppHost<HostConfig>({
    load: () => {
      const error = loadError?.();
      if (error) throw error;
      return { configStore: store };
    },
    build: (_config, h) => {
      hooks.push(h);
      const built = builds[next++];
      if (!built) throw new Error('unexpected build');
      return Promise.resolve(built.app);
    },
    fatal,
  });
  return { host, store, hooks, fatal };
}

describe('AppHost', () => {
  it('boots the app and reuses its auth service on a restart', async () => {
    const first = fakeApp();
    const second = fakeApp();
    const { host, hooks, fatal } = setup([first, second]);
    await host.boot();

    await host.restart();

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.start).toHaveBeenCalledOnce();
    expect(hooks[1]?.auth).toBe(auth);
    expect(fatal).not.toHaveBeenCalled();
  });

  it('restores the last working settings when the new ones fail to start', async () => {
    const first = fakeApp();
    const broken = fakeApp(true);
    const recovered = fakeApp();
    const { host, store, fatal } = setup([first, broken, recovered]);
    await host.boot();
    store.config = { settings: { port: 3999 } }; // what the user saved from the panel

    await host.restart();

    expect(store.config.settings).toEqual({ port: 3000 });
    expect(broken.stop).toHaveBeenCalledOnce(); // released the half-started app
    expect(recovered.start).toHaveBeenCalledOnce();
    expect(fatal).not.toHaveBeenCalled();
  });

  it('exits instead of staying up without a server when the recovery also fails', async () => {
    const first = fakeApp();
    const broken = fakeApp(true);
    const alsoBroken = fakeApp(true);
    const { host, fatal } = setup([first, broken, alsoBroken]);
    await host.boot();

    await expect(host.restart()).resolves.toBeUndefined();

    expect(fatal).toHaveBeenCalledOnce();
    expect(fatal.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('exits when the saved configuration cannot even be read', async () => {
    const first = fakeApp();
    let corrupt = false;
    const { host, fatal } = setup([first], () => (corrupt ? new Error('bad json') : undefined));
    await host.boot();
    corrupt = true;

    await expect(host.restart()).resolves.toBeUndefined();

    expect(fatal).toHaveBeenCalledOnce();
    expect(first.stop).not.toHaveBeenCalled(); // nothing was torn down before the failure
  });

  it('ignores a restart requested while another one is running', async () => {
    const first = fakeApp();
    const second = fakeApp();
    const { host } = setup([first, second]);
    await host.boot();

    await Promise.all([host.restart(), host.restart()]);

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.start).toHaveBeenCalledOnce();
  });

  it('ignores a restart before the first boot', async () => {
    const { host, fatal } = setup([]);

    await host.restart();

    expect(fatal).not.toHaveBeenCalled();
  });

  it('lets the panel ask for a restart through the hook', async () => {
    const first = fakeApp();
    const second = fakeApp();
    const { host, hooks } = setup([first, second]);
    await host.boot();

    hooks[0]?.requestRestart();
    await vi.waitFor(() => expect(second.start).toHaveBeenCalledOnce());
  });
});
