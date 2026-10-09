import type { LiveEvent } from '@tiklive/contracts';
import type { ActionScheduler } from '../../application/actions/action-scheduler.js';
import type { AuthService } from '../../application/auth/auth-service.js';
import type { AssetLibrary } from '../../application/assets/asset-library.js';
import type { AssetService } from '../../application/assets/asset-service.js';
import type { ConnectorSupervisor } from '../../application/connector/connector-supervisor.js';
import type { GiftCatalogService } from '../../application/gifts/gift-catalog-service.js';
import type { MetricsRegistry } from '../../application/metrics/metrics-registry.js';
import type { MaintenanceService } from '../../application/maintenance/maintenance-service.js';
import type { HealthService } from '../../application/health/health-service.js';
import type { AdminNotifier } from '../../application/ports/admin-notifier.js';
import type { ChannelGateway } from '../../application/ports/channel-gateway.js';
import type { GoalService } from '../../application/projections/goal-service.js';
import type { LeaderboardService } from '../../application/projections/leaderboard-service.js';
import type { RotatorService } from '../../application/projections/rotator-service.js';
import type { SnapshotPublisher } from '../../application/projections/snapshot-publisher.js';
import type { StatsProjection } from '../../domain/projections/stats-projection.js';
import type { AdminRegistry, ScreenRegistry } from '../../application/ports/socket-connection.js';
import type { RuleService } from '../../application/rules/rule-service.js';
import type { ModerationService } from '../../application/settings/moderation-service.js';
import type { SettingsService } from '../../application/settings/settings-service.js';
import type { SoundSearchService } from '../../application/sounds/sound-search-service.js';
import type { TriggerService } from '../../application/triggers/trigger-service.js';
import type { SimulatorService } from '../../application/simulator/simulator-service.js';

/** Everything the interface layer may talk to; assembled by the composition root. */
export interface HttpServices {
  readonly health: HealthService;
  readonly supervisor: ConnectorSupervisor;
  readonly rules: RuleService;
  readonly simulator: SimulatorService;
  readonly actions: ActionScheduler;
  readonly assets: AssetLibrary;
  readonly assetService: AssetService;
  /** Last events of the current session, for a dashboard opened mid-live. */
  readonly recentEvents: (limit: number) => Promise<LiveEvent[]>;
  readonly screens: ScreenRegistry;
  readonly admin: AdminRegistry & AdminNotifier;
  readonly projections: ProjectionServices;
  readonly auth: AuthService;
  readonly settings: SettingsService;
  readonly moderation: ModerationService;
  readonly gifts: GiftCatalogService;
  readonly sounds: SoundSearchService;
  readonly triggers: TriggerService;
  readonly maintenance: MaintenanceService;
  readonly metrics: Pick<MetricsRegistry, 'render'>;
}

/** Leaderboards, goals, stats and rotators (phase 3). */
export interface ProjectionServices {
  readonly leaderboards: LeaderboardService;
  readonly goals: GoalService;
  readonly stats: Pick<StatsProjection, 'snapshot'>;
  readonly publisher: SnapshotPublisher;
  readonly rotators: RotatorService;
  readonly channels: ChannelGateway;
}

export interface HttpOptions {
  /** Read on every request: the key can be rotated from the UI without a restart. */
  readonly overlayKey: () => string;
  readonly overlaysDir: string | undefined;
  readonly dashboardDir?: string | undefined;
  readonly mediaDir: string;
}
