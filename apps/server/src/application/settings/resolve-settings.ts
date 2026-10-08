import {
  SETTING_FIELDS,
  SETTING_KEYS,
  type SettingKey,
  type SettingSource,
  type SettingView,
  type SettingsValues,
} from '@tiklive/contracts';

export interface ResolvedSettings {
  readonly values: SettingsValues;
  readonly sources: Readonly<Record<SettingKey, SettingSource>>;
}

/** Precedence for every setting: value saved from the UI > environment variable > default. */
export function resolveSettings(
  defaults: SettingsValues,
  env: Partial<SettingsValues>,
  ui: Partial<SettingsValues>,
): ResolvedSettings {
  const values: Record<string, unknown> = {};
  const sources = {} as Record<SettingKey, SettingSource>;
  for (const key of SETTING_KEYS) {
    if (ui[key] !== undefined) {
      values[key] = ui[key];
      sources[key] = 'ui';
    } else if (env[key] !== undefined) {
      values[key] = env[key];
      sources[key] = 'env';
    } else {
      values[key] = defaults[key];
      sources[key] = 'default';
    }
  }
  return { values: values as SettingsValues, sources };
}

export function changedKeys(a: SettingsValues, b: SettingsValues): SettingKey[] {
  return SETTING_KEYS.filter((k) => a[k] !== b[k]);
}

/** Browser view of one setting; secrets only report whether they are set. */
export function viewOf(
  key: SettingKey,
  resolved: ResolvedSettings,
  running: SettingsValues,
): SettingView {
  const meta = SETTING_FIELDS[key];
  const value = resolved.values[key];
  return {
    ...(meta.secret ? {} : { value }),
    isSet: value !== '',
    source: resolved.sources[key],
    env: meta.env,
    apply: meta.apply,
    secret: meta.secret,
    pendingRestart: meta.apply === 'restart' && value !== running[key],
  };
}
