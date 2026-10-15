import type { GiftCatalog, GuideEntry } from '@tiklive/contracts';
import { buildGiftGuide } from '../../domain/projections/gift-guide.js';
import type { Logger } from '../ports/logger.js';
import type { RuleReader } from '../ports/rule-repository.js';

export interface GiftGuideSource {
  entries(): Promise<GuideEntry[]>;
}

interface GiftGuideDeps {
  readonly rules: RuleReader;
  readonly gifts: { get(): Promise<GiftCatalog> };
  readonly logger: Logger;
}

/** Reads the current rules (and, when available, the gift catalog) to explain gift -> action. */
export class GiftGuideService implements GiftGuideSource {
  constructor(private readonly deps: GiftGuideDeps) {}

  async entries(): Promise<GuideEntry[]> {
    const rules = await this.deps.rules.listAll();
    return buildGiftGuide(rules, await this.catalog());
  }

  /** The catalog only adds images and prices, so a failed download is not an error here. */
  private async catalog() {
    try {
      return (await this.deps.gifts.get()).gifts;
    } catch (error) {
      this.deps.logger.warn({ err: String(error) }, 'gift guide without the gift catalog');
      return [];
    }
  }
}
