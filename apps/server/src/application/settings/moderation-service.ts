import { ModerationSettingsSchema, type ModerationSettings } from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import { buildModerationChain, type TextFilterChain } from '../../domain/tts/text-filters.js';
import type { SettingsRepository } from '../ports/settings-repository.js';

export const MODERATION_SETTINGS_KEY = 'tts.moderation';

/** TTS moderation settings (RF-11) edited from the UI; the filter chain is rebuilt on save. */
export class ModerationService {
  private settings: ModerationSettings = ModerationSettingsSchema.parse({});
  private filters: TextFilterChain;

  constructor(
    private readonly repo: SettingsRepository,
    private readonly clock: Clock,
  ) {
    this.filters = buildModerationChain(this.settings, clock);
  }

  async load(): Promise<void> {
    const stored = await this.repo.get(MODERATION_SETTINGS_KEY, ModerationSettingsSchema);
    if (stored) this.apply(stored);
  }

  get(): ModerationSettings {
    return this.settings;
  }

  async update(settings: ModerationSettings): Promise<ModerationSettings> {
    await this.repo.set(MODERATION_SETTINGS_KEY, settings);
    this.apply(settings);
    return settings;
  }

  chain(): TextFilterChain {
    return this.filters;
  }

  private apply(settings: ModerationSettings): void {
    this.settings = settings;
    this.filters = buildModerationChain(settings, this.clock);
  }
}
