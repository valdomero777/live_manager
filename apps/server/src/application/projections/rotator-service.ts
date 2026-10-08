import { RotatorConfigSchema, type RotatorConfig } from '@tiklive/contracts';
import type { SettingsRepository } from '../ports/settings-repository.js';

export const ROTATOR_ID = /^[a-z0-9_-]{1,32}$/;

/** Default used when an overlay asks for a rotator that was never configured. */
export const DEFAULT_ROTATOR: RotatorConfig = RotatorConfigSchema.parse({
  panels: [
    { type: 'leaderboard', metric: 'diamonds', scope: 'session', title: 'Top regalos' },
    { type: 'leaderboard', metric: 'likes', scope: 'session', title: 'Top likes' },
    { type: 'stats', durationMs: 8000 },
  ],
});

/** Rotator configurations (spec 11) stored as versioned JSON in app_setting. */
export class RotatorService {
  constructor(private readonly settings: SettingsRepository) {}

  async get(id: string): Promise<RotatorConfig> {
    return (await this.settings.get(this.key(id), RotatorConfigSchema)) ?? DEFAULT_ROTATOR;
  }

  async save(id: string, config: RotatorConfig): Promise<RotatorConfig> {
    await this.settings.set(this.key(id), config);
    return config;
  }

  private key(id: string): string {
    if (!ROTATOR_ID.test(id)) throw new RangeError(`invalid rotator id: ${id}`);
    return `rotator:${id}`;
  }
}
