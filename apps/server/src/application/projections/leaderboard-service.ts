import {
  LeaderboardSettingsSchema,
  MAX_LEADERBOARD_LIMIT,
  type LeaderboardRow,
  type LeaderboardSettings,
  type Metric,
  type Scope,
} from '@tiklive/contracts';
import { scopeKey } from '../../domain/projections/scopes.js';
import type { Clock } from '../../domain/shared/time.js';
import type { LeaderboardRepository } from '../ports/leaderboard-repository.js';
import type { SettingsRepository } from '../ports/settings-repository.js';

export const LEADERBOARD_SETTINGS_KEY = 'leaderboard.settings';

interface LeaderboardDeps {
  readonly repo: LeaderboardRepository;
  readonly settings: SettingsRepository;
  readonly currentSessionId: () => number | undefined;
  readonly clock: Clock;
}

/**
 * Reads rankings through an in-memory top-N cache (spec 11) so overlays never hit SQLite per
 * frame. A generation counter prevents caching a query that raced with an invalidation.
 */
export class LeaderboardService {
  private readonly cache = new Map<string, LeaderboardRow[]>();
  private generation = 0;
  private config: LeaderboardSettings = { excludedUniqueIds: [] };

  constructor(private readonly deps: LeaderboardDeps) {}

  async loadSettings(): Promise<void> {
    const stored = await this.deps.settings.get(
      LEADERBOARD_SETTINGS_KEY,
      LeaderboardSettingsSchema,
    );
    if (stored) this.config = stored;
  }

  settings(): LeaderboardSettings {
    return this.config;
  }

  async updateSettings(settings: LeaderboardSettings): Promise<void> {
    await this.deps.settings.set(LEADERBOARD_SETTINGS_KEY, settings);
    this.config = settings;
    this.invalidateAll();
  }

  /** Concrete key for a logical scope; undefined for "session" when no session is active. */
  resolveScope(scope: Scope): string | undefined {
    const sessionId = this.deps.currentSessionId();
    if (scope === 'session' && sessionId === undefined) return undefined;
    return scopeKey(scope, sessionId ?? 0, this.deps.clock.now());
  }

  async top(
    metric: Metric,
    scope: Scope,
    limit = MAX_LEADERBOARD_LIMIT,
  ): Promise<LeaderboardRow[]> {
    const key = this.resolveScope(scope);
    if (key === undefined) return [];
    const cacheKey = `${metric}|${key}`;
    let rows = this.cache.get(cacheKey);
    if (!rows) {
      const generation = this.generation;
      rows = await this.deps.repo.top(
        metric,
        key,
        MAX_LEADERBOARD_LIMIT,
        this.config.excludedUniqueIds,
      );
      if (generation === this.generation) this.cache.set(cacheKey, rows);
    }
    return rows.slice(0, Math.min(limit, MAX_LEADERBOARD_LIMIT));
  }

  invalidate(metrics: readonly Metric[]): void {
    this.generation++;
    for (const key of this.cache.keys()) {
      if (metrics.some((m) => key.startsWith(`${m}|`))) this.cache.delete(key);
    }
  }

  invalidateAll(): void {
    this.generation++;
    this.cache.clear();
  }

  /** Session reset never touches week/total (RF-14). */
  async reset(scope: Scope): Promise<number> {
    const key = this.resolveScope(scope);
    if (key === undefined) return 0;
    const removed = await this.deps.repo.reset(key);
    this.invalidateAll();
    return removed;
  }
}
