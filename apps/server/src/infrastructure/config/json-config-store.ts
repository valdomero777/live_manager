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

/** Why the file could not be used and where it went (undefined when it could not be moved). */
export interface CorruptConfig {
  readonly reason: string;
  readonly movedTo: string | undefined;
}

/**
 * Settings saved from the UI, as JSON next to the data directory. Writes are atomic (temp file +
 * rename) and the file is owner-only because it holds secrets (spec 4: permissions 600).
 *
 * A file that is not valid JSON (e.g. a power cut in the middle of a save) must not stop the
 * server from starting: it is moved aside as `<file>.corrupt-<time>` and the app starts with the
 * defaults, which brings back the first-run password setup.
 */
export class JsonConfigStore implements ConfigStore {
  constructor(
    readonly location: string,
    private readonly onInvalid: (key: string) => void = () => undefined,
    private readonly onCorrupt: (info: CorruptConfig) => void = () => undefined,
  ) {}

  read(): StoredConfig {
    if (!existsSync(this.location)) return { settings: {} };
    const file = this.parse();
    if (!file) return { settings: {} };
    const settings = validSettings(file.settings, this.onInvalid);
    return file.adminPasswordHash
      ? { settings, adminPasswordHash: file.adminPasswordHash }
      : { settings };
  }

  private parse(): z.infer<typeof FileSchema> | undefined {
    try {
      return FileSchema.parse(JSON.parse(readFileSync(this.location, 'utf8')));
    } catch (error) {
      this.onCorrupt({ reason: String(error), movedTo: this.moveAside() });
      return undefined;
    }
  }

  private moveAside(): string | undefined {
    const target = `${this.location}.corrupt-${new Date().toISOString().replace(/[:.]/g, '')}`;
    try {
      renameSync(this.location, target);
      return target;
    } catch {
      return undefined;
    }
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
