import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SETTING_KEYS, SettingsValuesSchema, type SettingsValues } from '@tiklive/contracts';
import { z } from 'zod';
import type { ConfigStore, StoredConfig } from '../../application/ports/config-store.js';

const FileSchema = z.object({
  version: z.literal(1).default(1),
  settings: z.record(z.string(), z.unknown()).default({}),
  adminPasswordHash: z.string().optional(),
});

/** Keeps only the settings that are individually valid, so one bad value never blocks startup. */
function validSettings(
  raw: Record<string, unknown>,
  onInvalid: (key: string) => void,
): Partial<SettingsValues> {
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    if (!(key in raw)) continue;
    const parsed = SettingsValuesSchema.shape[key].safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
    else onInvalid(key);
  }
  return out;
}

/**
 * Settings saved from the UI, as JSON next to the data directory. Writes are atomic (temp file +
 * rename) and the file is owner-only because it holds secrets (spec 4: permissions 600).
 */
export class JsonConfigStore implements ConfigStore {
  constructor(
    readonly location: string,
    private readonly onInvalid: (key: string) => void = () => undefined,
  ) {}

  read(): StoredConfig {
    if (!existsSync(this.location)) return { settings: {} };
    const file = FileSchema.parse(JSON.parse(readFileSync(this.location, 'utf8')));
    const settings = validSettings(file.settings, this.onInvalid);
    return file.adminPasswordHash
      ? { settings, adminPasswordHash: file.adminPasswordHash }
      : { settings };
  }

  write(config: StoredConfig): void {
    mkdirSync(dirname(this.location), { recursive: true });
    const temp = `${this.location}.tmp`;
    const body = {
      version: 1,
      settings: config.settings,
      adminPasswordHash: config.adminPasswordHash,
    };
    writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, this.location);
    chmodSync(this.location, 0o600);
  }
}
