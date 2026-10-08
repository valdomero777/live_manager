import type { SettingsValues } from '@tiklive/contracts';

/** What the UI saved: per-setting overrides plus the dashboard password hash. */
export interface StoredConfig {
  readonly settings: Partial<SettingsValues>;
  readonly adminPasswordHash?: string;
}

/** Persistent, rewritable configuration (a JSON file next to the data). */
export interface ConfigStore {
  readonly location: string;
  read(): StoredConfig;
  write(config: StoredConfig): void;
}

/** Cryptographically secure secrets: session tokens, overlay keys, setup codes. */
export interface SecretGenerator {
  token(): string;
  /** Short human-typable one-time code. */
  code(): string;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
