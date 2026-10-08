import {
  SETTING_FIELDS,
  SETTING_KEYS,
  SettingsValuesSchema,
  type SettingKey,
  type SettingsPatch,
  type SettingsResponse,
  type SettingsUpdateResult,
  type SettingsValues,
} from '@tiklive/contracts';
import type { ConfigStore, SecretGenerator } from '../ports/config-store.js';
import type { Logger } from '../ports/logger.js';
import { changedKeys, resolveSettings, viewOf } from './resolve-settings.js';

/** Hooks that apply a setting without restarting (log level, overlay key, TikTok user). */
export type LiveAppliers = {
  readonly [K in SettingKey]?: (value: SettingsValues[K], all: SettingsValues) => void;
};

interface SettingsDeps {
  readonly store: ConfigStore;
  readonly defaults: SettingsValues;
  readonly env: Partial<SettingsValues>;
  /** Values this server instance is running with. */
  readonly running: SettingsValues;
  readonly appliers: LiveAppliers;
  readonly secrets: SecretGenerator;
  readonly requestRestart: () => void;
  readonly logger: Logger;
}

/**
 * Edits every former environment variable from the UI. Saved values are persisted as overrides;
 * live/reconnect settings apply at once, restart settings wait for an explicit restart.
 */
export class SettingsService {
  private running: SettingsValues;

  constructor(private readonly deps: SettingsDeps) {
    this.running = { ...deps.running };
  }

  view(): SettingsResponse {
    const resolved = this.resolve(this.deps.store.read().settings);
    const fields = Object.fromEntries(
      SETTING_KEYS.map((k) => [k, viewOf(k, resolved, this.running)]),
    );
    return {
      fields,
      restartPending: Object.values(fields).some((f) => f.pendingRestart),
      configPath: this.deps.store.location,
    };
  }

  update(patch: SettingsPatch): SettingsUpdateResult {
    const stored = this.deps.store.read();
    const overrides: Partial<SettingsValues> = { ...stored.settings };
    for (const key of SETTING_KEYS) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === null) delete overrides[key];
      else if (value !== undefined) Object.assign(overrides, { [key]: value });
    }
    const next = SettingsValuesSchema.parse(this.resolve(overrides).values);
    this.deps.store.write({ ...stored, settings: overrides });

    const changed = changedKeys(this.running, next);
    const applied = changed.filter((k) => SETTING_FIELDS[k].apply !== 'restart');
    for (const key of applied) this.applyLive(key, next);
    const restartRequired = changed.filter((k) => SETTING_FIELDS[k].apply === 'restart');
    this.deps.logger.info({ applied, restartRequired }, 'settings updated');
    return { ...this.view(), applied, restartRequired };
  }

  /** Revokes the current overlay URLs by issuing a new read-only key. */
  rotateOverlayKey(): SettingsUpdateResult {
    return this.update({ overlayKey: this.deps.secrets.token() });
  }

  restart(): void {
    this.deps.logger.info({}, 'restart requested from the UI');
    this.deps.requestRestart();
  }

  private applyLive<K extends SettingKey>(key: K, next: SettingsValues): void {
    this.running = { ...this.running, [key]: next[key] };
    const apply = this.deps.appliers[key] as
      ((v: SettingsValues[K], all: SettingsValues) => void) | undefined;
    apply?.(next[key], this.running);
  }

  private resolve(overrides: Partial<SettingsValues>) {
    return resolveSettings(this.deps.defaults, this.deps.env, overrides);
  }
}
