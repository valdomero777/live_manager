import type { Clock } from '../shared/time.js';

export interface TextFilterContext {
  readonly viewerId: string;
}

/** One moderation/preparation step. Returning null discards the text. */
export interface TextFilter {
  readonly name: string;
  apply(text: string, ctx: TextFilterContext): string | null;
}

export interface ModerationSettings {
  readonly maxLength: number;
  readonly blockedTerms: readonly string[];
  readonly blockMode: 'drop' | 'mask';
  readonly readMentions: boolean;
  readonly stripEmojis: boolean;
  readonly maxPerUserPerMinute: number;
  readonly duplicateWindowMs: number;
  readonly pronunciations: Readonly<Record<string, string>>;
}

export const DEFAULT_MODERATION: ModerationSettings = {
  maxLength: 150,
  blockedTerms: [],
  blockMode: 'drop',
  readMentions: false,
  stripEmojis: true,
  maxPerUserPerMinute: 3,
  duplicateWindowMs: 30_000,
  pronunciations: {},
};

const REPEATED_CHARS = /(.)\1{2,}/gu;
const URL_OR_EMAIL = /\b(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w-]+\.[\w.]+\b/giu;
const MENTION = /@[\w.]+/gu;
const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;
const MULTISPACE = /\s+/g;

function nonEmpty(text: string): string | null {
  const trimmed = text.replace(MULTISPACE, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const normalizeFilter: TextFilter = {
  name: 'normalize',
  apply: (text) => nonEmpty(text.replace(REPEATED_CHARS, '$1$1')),
};

export function linksFilter(readMentions: boolean): TextFilter {
  return {
    name: 'links',
    apply: (text) => {
      const noLinks = text.replace(URL_OR_EMAIL, ' ');
      return nonEmpty(readMentions ? noLinks : noLinks.replace(MENTION, ' '));
    },
  };
}

export function emojiFilter(strip: boolean): TextFilter {
  return { name: 'emoji', apply: (text) => (strip ? nonEmpty(text.replace(EMOJI, ' ')) : text) };
}

export function blocklistFilter(terms: readonly string[], mode: 'drop' | 'mask'): TextFilter {
  // 'g' only for masking: a global regex keeps lastIndex between test() calls.
  const flags = mode === 'mask' ? 'giu' : 'iu';
  const patterns = terms
    .filter((t) => t.trim().length > 0)
    .map((t) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(t.trim())}(?![\\p{L}\\p{N}])`, flags));
  return {
    name: 'blocklist',
    apply: (text) => {
      if (patterns.length === 0) return text;
      if (mode === 'drop') return patterns.some((p) => p.test(text)) ? null : text;
      return nonEmpty(patterns.reduce((acc, p) => acc.replace(p, '***'), text));
    },
  };
}

export function lengthFilter(maxLength: number): TextFilter {
  return {
    name: 'length',
    apply: (text) => (text.length <= maxLength ? text : text.slice(0, maxLength).trimEnd()),
  };
}

export function pronunciationFilter(dictionary: Readonly<Record<string, string>>): TextFilter {
  const entries = Object.entries(dictionary).map(
    ([word, spoken]) => [new RegExp(`\\b${escapeRegex(word)}\\b`, 'giu'), spoken] as const,
  );
  return {
    name: 'pronunciation',
    apply: (text) => entries.reduce((acc, [pattern, spoken]) => acc.replace(pattern, spoken), text),
  };
}

/** Stateful: max readings per viewer per rolling minute. */
export class PerUserRateFilter implements TextFilter {
  readonly name = 'userSpam';
  private readonly history = new Map<string, number[]>();

  constructor(
    private readonly clock: Clock,
    private readonly maxPerMinute: number,
  ) {}

  apply(text: string, ctx: TextFilterContext): string | null {
    const now = this.clock.now();
    const recent = (this.history.get(ctx.viewerId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= this.maxPerMinute) {
      this.history.set(ctx.viewerId, recent);
      return null;
    }
    recent.push(now);
    this.history.set(ctx.viewerId, recent);
    return text;
  }
}

/** Stateful: drops the same (case-insensitive) text seen within the window. */
export class DuplicateTextFilter implements TextFilter {
  readonly name = 'duplicates';
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly clock: Clock,
    private readonly windowMs: number,
  ) {}

  apply(text: string): string | null {
    const now = this.clock.now();
    this.evictExpired(now);
    const key = text.toLowerCase();
    if (this.seen.has(key)) return null;
    this.seen.set(key, now);
    return text;
  }

  private evictExpired(now: number): void {
    for (const [key, at] of this.seen) {
      if (now - at >= this.windowMs) this.seen.delete(key);
    }
  }
}

/** Ordered chain (spec section 10). Stops at the first filter that discards the text. */
export class TextFilterChain {
  constructor(private readonly filters: readonly TextFilter[]) {}

  apply(text: string, ctx: TextFilterContext): string | null {
    let current: string | null = text;
    for (const filter of this.filters) {
      if (current === null) return null;
      current = filter.apply(current, ctx);
    }
    return current;
  }
}

export function buildModerationChain(settings: ModerationSettings, clock: Clock): TextFilterChain {
  return new TextFilterChain([
    normalizeFilter,
    linksFilter(settings.readMentions),
    emojiFilter(settings.stripEmojis),
    blocklistFilter(settings.blockedTerms, settings.blockMode),
    lengthFilter(settings.maxLength),
    new PerUserRateFilter(clock, settings.maxPerUserPerMinute),
    new DuplicateTextFilter(clock, settings.duplicateWindowMs),
    pronunciationFilter(settings.pronunciations),
  ]);
}
