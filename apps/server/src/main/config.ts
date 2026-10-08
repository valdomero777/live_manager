import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SETTING_FIELDS,
  SETTING_KEYS,
  SettingsValuesSchema,
  type SettingKey,
  type SettingsValues,
} from '@tiklive/contracts';
import type { ConfigStore } from '../application/ports/config-store.js';
import { resolveSettings } from '../application/settings/resolve-settings.js';
import { parseHostList, type WebhookPolicy } from '../domain/webhook/network-guard.js';
import { DEFAULT_MYINSTANTS_API_URL } from '../infrastructure/myinstants/myinstants-provider.js';
import { JsonConfigStore } from '../infrastructure/config/json-config-store.js';

const DEFAULT_OVERLAYS_DIR = fileURLToPath(
  new URL('../../../../packages/overlays/dist', import.meta.url),
);

/** Build output of the Angular dashboard; a build artefact, not a user setting. */
const DASHBOARD_DIR = fileURLToPath(
  new URL('../../../dashboard/dist/dashboard/browser', import.meta.url),
);

/** The one setting that cannot live in the UI: where the UI-saved settings are stored. */
export const CONFIG_PATH_ENV = 'CONFIG_PATH';
const DEFAULT_CONFIG_PATH = './data/config.json';
const IN_MEMORY_DB = ':memory:';

export const DEFAULT_SETTINGS: SettingsValues = {
  port: 3000,
  host: '0.0.0.0',
  dbPath: './data/app.db',
  assetsDir: './data/assets',
  overlaysDir: DEFAULT_OVERLAYS_DIR,
  tiktokUsername: '',
  simulate: false,
  signApiKey: '',
  overlayKey: '',
  logLevel: 'info',
};

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly tiktokUsername: string | undefined;
  readonly dbPath: string;
  readonly assetsDir: string;
  readonly overlaysDir: string;
  readonly dashboardDir: string;
  readonly overlayKey: string;
  readonly logLevel: SettingsValues['logLevel'];
  readonly simulate: boolean;
  readonly signApiKey: string | undefined;
  readonly version: string;
  /** Base URL of the community MyInstants API; a deployment detail, not a UI setting. */
  readonly myInstantsApiUrl: string;
  /** Hosts the webhook action may call (WEBHOOK_ALLOWED_HOSTS); empty = webhooks disabled. */
  readonly webhookPolicy: WebhookPolicy;
  /** RECORD_PATH: append every raw event of a real live to this JSONL file (for replay). */
  readonly recordPath: string | undefined;
  /** Raw resolved values, as the settings UI shows them. */
  readonly settings: SettingsValues;
  readonly env: Partial<SettingsValues>;
  readonly configStore: ConfigStore;
  readonly envPasswordHash: string | undefined;
  /** Ignored invalid values, reported in the startup log. */
  readonly warnings: readonly string[];
}

function parseEnvValue(key: SettingKey, raw: string): unknown {
  if (key === 'port') return Number(raw);
  if (key === 'simulate') return raw === 'true' || raw === '1';
  return raw;
}

/** Environment values that pass validation; invalid ones are skipped (not fatal) with a warning. */
function readEnv(env: NodeJS.ProcessEnv, warnings: string[]): Partial<SettingsValues> {
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const name = SETTING_FIELDS[key].env;
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    const parsed = SettingsValuesSchema.shape[key].safeParse(parseEnvValue(key, raw));
    if (parsed.success) out[key] = parsed.data;
    else warnings.push(`${name} no es válido y se ignora`);
  }
  return out;
}

/** A fresh install gets a random overlay key, saved so it survives restarts. */
function ensureOverlayKey(store: ConfigStore, env: Partial<SettingsValues>): void {
  const stored = store.read();
  if (stored.settings.overlayKey || env.overlayKey) return;
  const overlayKey = randomBytes(24).toString('base64url');
  store.write({ ...stored, settings: { ...stored.settings, overlayKey } });
}

const absolute = (path: string) => (path === IN_MEMORY_DB ? path : resolve(path));

/**
 * Builds the running configuration. Precedence per setting: saved from the UI > environment
 * variable > default. Re-run on every in-process restart so UI changes take effect.
 */
export function loadConfig(env: NodeJS.ProcessEnv, version: string): AppConfig {
  const warnings: string[] = [];
  const configPath = absolute(env[CONFIG_PATH_ENV] || DEFAULT_CONFIG_PATH);
  const store = new JsonConfigStore(configPath, (key) =>
    warnings.push(`${key} guardado en ${configPath} no es válido y se ignora`),
  );
  const envValues = readEnv(env, warnings);
  ensureOverlayKey(store, envValues);
  const s = resolveSettings(DEFAULT_SETTINGS, envValues, store.read().settings).values;
  return {
    port: s.port,
    host: s.host,
    tiktokUsername: s.tiktokUsername || undefined,
    dbPath: absolute(s.dbPath),
    assetsDir: absolute(s.assetsDir),
    overlaysDir: absolute(s.overlaysDir),
    dashboardDir: env['DASHBOARD_DIR'] ? absolute(env['DASHBOARD_DIR']) : DASHBOARD_DIR,
    overlayKey: s.overlayKey,
    logLevel: s.logLevel,
    simulate: s.simulate,
    signApiKey: s.signApiKey || undefined,
    version,
    myInstantsApiUrl: env['MYINSTANTS_API_URL'] || DEFAULT_MYINSTANTS_API_URL,
    recordPath: env['RECORD_PATH'] ? absolute(env['RECORD_PATH']) : undefined,
    webhookPolicy: {
      allowedHosts: parseHostList(env['WEBHOOK_ALLOWED_HOSTS']),
      privateHosts: parseHostList(env['WEBHOOK_PRIVATE_HOSTS']),
    },
    settings: s,
    env: envValues,
    configStore: store,
    envPasswordHash: env['ADMIN_PASSWORD_HASH'] || undefined,
    warnings,
  };
}
