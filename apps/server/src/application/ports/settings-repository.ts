import type { z } from 'zod';

/** Typed access to app_setting; values are JSON validated with the caller's schema. */
export interface SettingsRepository {
  get<S extends z.ZodType>(key: string, schema: S): Promise<z.infer<S> | undefined>;
  set(key: string, value: unknown): Promise<void>;
}
