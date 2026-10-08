import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { ActionScheduler } from '../application/actions/action-scheduler.js';
import { AuthService } from '../application/auth/auth-service.js';
import { AssetLibrary } from '../application/assets/asset-library.js';
import { AssetService } from '../application/assets/asset-service.js';
import { ConnectorSupervisor } from '../application/connector/connector-supervisor.js';
import { GiftCatalogService } from '../application/gifts/gift-catalog-service.js';
import { HealthService } from '../application/health/health-service.js';
import { EventNormalizer } from '../application/ingest/event-normalizer.js';
import {
  IngestLiveEvent,
  type LiveEventConsumer,
} from '../application/ingest/ingest-live-event.js';
import { LiveEventPipeline } from '../application/ingest/live-event-pipeline.js';
import { SessionService } from '../application/ingest/session-service.js';
import type { GiftCatalogSource } from '../application/ports/gift-catalog-source.js';
import type { SoundProvider } from '../application/ports/sound-provider.js';
import type { LiveEventSource } from '../application/ports/live-event-source.js';
import type { Logger } from '../application/ports/logger.js';
import { GoalService } from '../application/projections/goal-service.js';
import { LeaderboardService } from '../application/projections/leaderboard-service.js';
import { RotatorService } from '../application/projections/rotator-service.js';
import { SnapshotPublisher } from '../application/projections/snapshot-publisher.js';
import { RuleEngine } from '../application/rules/rule-engine.js';
import { RuleService } from '../application/rules/rule-service.js';
import { SoundSearchService } from '../application/sounds/sound-search-service.js';
import { TriggerExecutor } from '../application/triggers/trigger-executor.js';
import { TriggerService } from '../application/triggers/trigger-service.js';
import { ModerationService } from '../application/settings/moderation-service.js';
import { SettingsService } from '../application/settings/settings-service.js';
import { SIMULATOR_TARGET, SimulatorService } from '../application/simulator/simulator-service.js';
import { StatsProjection } from '../domain/projections/stats-projection.js';
import { createDefaultActionRegistry } from '../domain/rules/actions.js';
import { createDefaultConditionRegistry } from '../domain/rules/conditions.js';
import { RuleRateLimiter } from '../domain/rules/rate-limiter.js';
import { Argon2Hasher } from '../infrastructure/auth/argon2-hasher.js';
import { MyInstantsProvider } from '../infrastructure/myinstants/myinstants-provider.js';
import { SimulatedSource } from '../infrastructure/simulator/simulated-source.adapter.js';
import { LocalAssetStorage } from '../infrastructure/storage/local-asset-storage.js';
import {
  isDatabaseHealthy,
  openDatabase,
  type DatabaseHandle,
} from '../infrastructure/sqlite/database.js';
import { runMigrations } from '../infrastructure/sqlite/migrator.js';
import { SqliteAssetRepository } from '../infrastructure/sqlite/sqlite-asset-repository.js';
import { SqliteEventStore } from '../infrastructure/sqlite/sqlite-event-store.js';
import { SqliteGoalRepository } from '../infrastructure/sqlite/sqlite-goal-repository.js';
import { SqliteLeaderboardRepository } from '../infrastructure/sqlite/sqlite-leaderboard-repository.js';
import { SqliteRuleRepository } from '../infrastructure/sqlite/sqlite-rule-repository.js';
import { SqliteTriggerRepository } from '../infrastructure/sqlite/sqlite-trigger-repository.js';
import { SqliteSettingsRepository } from '../infrastructure/sqlite/sqlite-settings-repository.js';
import { SqliteSessionRepository } from '../infrastructure/sqlite/sqlite-session-repository.js';
import { createLogger, createPinoInstance } from '../infrastructure/system/pino-logger.js';
import {
  CryptoRandom,
  CryptoSecrets,
  NodeScheduler,
  SystemClock,
  UuidGenerator,
} from '../infrastructure/system/system.js';
import { TikTokGiftCatalog } from '../infrastructure/tiktok/tiktok-gift-catalog.js';
import { TikTokLiveConnectorAdapter } from '../infrastructure/tiktok/tiktok-live-connector.adapter.js';
import { AdminSocketHub } from '../infrastructure/ws/admin-socket-hub.js';
import { ScreenSocketHub } from '../infrastructure/ws/screen-socket-hub.js';
import { buildHttpServer } from '../interface/http/build-http-server.js';
import type { HttpServices } from '../interface/http/services.js';
import { DEFAULT_SETTINGS, type AppConfig } from './config.js';

const SHUTDOWN_DRAIN_MS = 5_000;

export interface App {
  readonly http: FastifyInstance;
  readonly logger: Logger;
  readonly auth: AuthService;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Process-wide primitives shared by every module. */
function buildRuntime(cfg: AppConfig) {
  const pino = createPinoInstance(cfg.logLevel);
  return {
    pino,
    logger: createLogger(pino),
    clock: new SystemClock(),
    random: new CryptoRandom(),
    ids: new UuidGenerator(),
    scheduler: new NodeScheduler(),
    secrets: new CryptoSecrets(),
  };
}
type Runtime = ReturnType<typeof buildRuntime>;

function buildPersistence(cfg: AppConfig, rt: Runtime) {
  mkdirSync(cfg.assetsDir, { recursive: true });
  const database = openDatabase(cfg.dbPath);
  const applied = runMigrations(database.sqlite);
  if (applied.length > 0) rt.logger.info({ applied }, 'migrations applied');
  const assetRepo = new SqliteAssetRepository(database.db);
  const rules = new SqliteRuleRepository(database.db, (id, error) =>
    rt.logger.error({ ruleId: id, err: String(error) }, 'stored rule is corrupt and was skipped'),
  );
  return {
    database,
    rules,
    assetRepo,
    assets: new AssetLibrary(assetRepo),
    sessions: new SessionService(new SqliteSessionRepository(database.db), rt.clock, rt.logger),
    events: new SqliteEventStore(database.sqlite),
    leaderboards: new SqliteLeaderboardRepository(database.db),
    goals: new SqliteGoalRepository(database.db),
    settings: new SqliteSettingsRepository(database.db),
    triggers: new SqliteTriggerRepository(database.db, (id, error) =>
      rt.logger.error(
        { triggerId: id, err: String(error) },
        'stored trigger is corrupt and was skipped',
      ),
    ),
  };
}
type Persistence = ReturnType<typeof buildPersistence>;

function buildReactions(
  rt: Runtime,
  db: Persistence,
  screens: ScreenSocketHub,
  admin: AdminSocketHub,
) {
  const actions = new ActionScheduler({
    gateway: screens,
    scheduler: rt.scheduler,
    clock: rt.clock,
    logger: rt.logger.child({ module: 'actions' }),
  });
  const moderation = new ModerationService(db.settings, rt.clock);
  const handlers = createDefaultActionRegistry();
  const engine = new RuleEngine({
    rules: db.rules,
    conditions: createDefaultConditionRegistry(),
    actions: handlers,
    limiter: new RuleRateLimiter(rt.clock, rt.random),
    sink: actions,
    assets: db.assets,
    moderation: () => moderation.chain(),
    ids: rt.ids,
    random: rt.random,
    notifier: admin,
    logger: rt.logger.child({ module: 'rules' }),
    onInvalidRule: (rule) => db.rules.setEnabled(rule.id, false),
  });
  const triggers = new TriggerExecutor({
    repo: db.triggers,
    sink: actions,
    ids: rt.ids,
    logger: rt.logger.child({ module: 'triggers' }),
  });
  return { actions, engine, handlers, moderation, triggers };
}
type Reactions = ReturnType<typeof buildReactions>;

/** Leaderboards, goals and stats: read models fed by every accepted event (spec 11). */
function buildProjections(rt: Runtime, db: Persistence, screens: ScreenSocketHub, r: Reactions) {
  const currentSessionId = () => db.sessions.currentId();
  const leaderboards = new LeaderboardService({
    repo: db.leaderboards,
    settings: db.settings,
    currentSessionId,
    clock: rt.clock,
  });
  const goals = new GoalService({
    repo: db.goals,
    totals: db.leaderboards,
    currentSessionId,
    actions: r.handlers,
    assets: db.assets,
    sink: r.actions,
    ids: rt.ids,
    clock: rt.clock,
    logger: rt.logger.child({ module: 'goals' }),
  });
  const stats = new StatsProjection();
  const publisher = new SnapshotPublisher({
    gateway: screens,
    leaderboards,
    goals,
    stats,
    scheduler: rt.scheduler,
    clock: rt.clock,
    logger: rt.logger.child({ module: 'projections' }),
  });
  db.sessions.onChange((session) => {
    if (session) stats.startSession(session.id, session.startedAt);
    publisher.refreshAll();
  });
  const rotators = new RotatorService(db.settings);
  return { leaderboards, goals, stats, publisher, rotators, channels: screens };
}
type Projections = ReturnType<typeof buildProjections>;

function buildIntake(
  rt: Runtime,
  db: Persistence,
  consumers: readonly LiveEventConsumer[],
  admin: AdminSocketHub,
) {
  const normalizer = new EventNormalizer({
    clock: rt.clock,
    ids: rt.ids,
    onDrop: (reason, raw) => rt.logger.debug({ reason, kind: raw.kind }, 'event dropped'),
  });
  const ingest = new IngestLiveEvent({
    events: db.events,
    consumers,
    notifier: admin,
    logger: rt.logger.child({ module: 'ingest' }),
  });
  const { scheduler, logger } = rt;
  return new LiveEventPipeline({ normalizer, sessions: db.sessions, ingest, scheduler, logger });
}

function buildConnector(
  cfg: AppConfig,
  rt: Runtime,
  pipeline: LiveEventPipeline,
  admin: AdminSocketHub,
) {
  const source: LiveEventSource = cfg.simulate
    ? new SimulatedSource()
    : new TikTokLiveConnectorAdapter(rt.clock, rt.logger.child({ module: 'tiktok' }), {
        ...(cfg.signApiKey ? { signApiKey: cfg.signApiKey } : {}),
      });
  const { scheduler, clock, random } = rt;
  const logger = rt.logger.child({ module: 'connector' });
  const supervisor = new ConnectorSupervisor({ source, scheduler, clock, random, logger });
  source.onEvent((raw) => pipeline.accept(raw, supervisor.status().target ?? SIMULATOR_TARGET));
  supervisor.onStatus((status) => admin.publish('connector.status', status));
  return supervisor;
}

/** Things that outlive one app instance: sessions survive an in-process restart. */
export interface AppHooks {
  readonly auth?: AuthService;
  readonly requestRestart?: () => void;
  /** Tests replace TikTok's gift list with a fake. */
  readonly giftSource?: GiftCatalogSource;
  /** Tests replace the MyInstants lookup with a fake. */
  readonly soundProvider?: SoundProvider;
}

export function createAuthService(cfg: AppConfig, logger: Logger): AuthService {
  return new AuthService({
    store: cfg.configStore,
    envPasswordHash: cfg.envPasswordHash,
    hasher: new Argon2Hasher(),
    secrets: new CryptoSecrets(),
    clock: new SystemClock(),
    logger: logger.child({ module: 'auth' }),
  });
}

interface ServiceParts {
  cfg: AppConfig;
  rt: Runtime;
  db: Persistence;
  screens: ScreenSocketHub;
  admin: AdminSocketHub;
  reactions: Reactions;
  pipeline: LiveEventPipeline;
  supervisor: ConnectorSupervisor;
  projections: Projections;
  auth: AuthService;
  overlayAccess: { key: string };
  requestRestart: () => void;
  hooks: AppHooks;
}

/** Settings that apply without a restart (spec: no reconnect storms during a live). */
function buildSettings(p: ServiceParts): SettingsService {
  return new SettingsService({
    store: p.cfg.configStore,
    defaults: DEFAULT_SETTINGS,
    env: p.cfg.env,
    running: p.cfg.settings,
    secrets: p.rt.secrets,
    requestRestart: p.requestRestart,
    logger: p.rt.logger.child({ module: 'settings' }),
    appliers: {
      logLevel: (level) => {
        p.rt.pino.level = level;
      },
      overlayKey: (key) => {
        p.overlayAccess.key = key;
        p.screens.closeAll(); // old URLs stop working at once; overlays must use the new key
      },
      tiktokUsername: (user, all) => {
        if (all.simulate) return;
        void (user ? p.supervisor.connect(user) : p.supervisor.stop());
      },
    },
  });
}

function buildAssetService(p: ServiceParts): AssetService {
  return new AssetService({
    repo: p.db.assetRepo,
    storage: new LocalAssetStorage(p.cfg.assetsDir),
    library: p.db.assets,
    sha256: (content) => createHash('sha256').update(content).digest('hex'),
    clock: p.rt.clock,
    references: async () => [
      ...(await p.db.rules.listAll()).map((r) => ({
        owner: `regla «${r.name}»`,
        actions: r.actions,
      })),
      ...p.projections.goals.list().map((g) => ({ owner: `meta «${g.name}»`, actions: g.onReach })),
    ],
  });
}

function buildGiftService(p: ServiceParts): GiftCatalogService {
  return new GiftCatalogService({
    source: p.hooks.giftSource ?? new TikTokGiftCatalog(),
    settings: p.db.settings,
    clock: p.rt.clock,
    logger: p.rt.logger.child({ module: 'gifts' }),
  });
}

/** MyInstants search (cached) and sound-trigger CRUD. */
function buildTriggerServices(p: ServiceParts) {
  const provider =
    p.hooks.soundProvider ??
    new MyInstantsProvider(p.rt.logger.child({ module: 'myinstants' }), p.cfg.myInstantsApiUrl);
  return {
    sounds: new SoundSearchService(provider, p.rt.clock),
    triggers: new TriggerService(p.db.triggers, p.reactions.triggers, p.rt.clock),
  };
}

function buildServices(p: ServiceParts): HttpServices {
  const health = new HealthService({
    supervisor: p.supervisor,
    actions: p.reactions.actions,
    screens: p.screens,
    isDbHealthy: () => isDatabaseHealthy(p.db.database),
    clock: p.rt.clock,
    startedAt: p.rt.clock.now(),
    version: p.cfg.version,
  });
  return {
    health,
    supervisor: p.supervisor,
    rules: new RuleService(p.db.rules, p.reactions.engine, {
      ids: p.rt.ids,
      clock: p.rt.clock,
      currentSessionId: () => p.db.sessions.currentId(),
    }),
    assetService: buildAssetService(p),
    recentEvents: async (limit) => {
      const sessionId = p.db.sessions.currentId();
      return sessionId === undefined ? [] : p.db.events.recent(sessionId, limit);
    },
    simulator: new SimulatorService(p.pipeline, p.supervisor, p.rt.clock, p.rt.ids),
    actions: p.reactions.actions,
    assets: p.db.assets,
    screens: p.screens,
    admin: p.admin,
    projections: p.projections,
    auth: p.auth,
    settings: buildSettings(p),
    moderation: p.reactions.moderation,
    gifts: buildGiftService(p),
    ...buildTriggerServices(p),
  };
}

/** The only place that instantiates concrete dependencies (manual DI, no container). */
export async function buildApp(cfg: AppConfig, hooks: AppHooks = {}): Promise<App> {
  const rt = buildRuntime(cfg);
  const db = buildPersistence(cfg, rt);
  const screens = new ScreenSocketHub();
  const admin = new AdminSocketHub(rt.clock);
  const reactions = buildReactions(rt, db, screens, admin);
  const projections = buildProjections(rt, db, screens, reactions);
  const pipeline = buildIntake(
    rt,
    db,
    [projections.publisher, reactions.engine, reactions.triggers],
    admin,
  );
  const supervisor = buildConnector(cfg, rt, pipeline, admin);
  const auth = hooks.auth ?? createAuthService(cfg, rt.logger);
  const overlayAccess = { key: cfg.overlayKey };
  const requestRestart =
    hooks.requestRestart ?? (() => rt.logger.warn({}, 'restart is not available in this mode'));
  const services = buildServices({
    ...{ cfg, rt, db, screens, admin, reactions, pipeline, supervisor, projections },
    ...{ auth, overlayAccess, requestRestart, hooks },
  });
  const http = await buildHttpServer(
    services,
    {
      overlayKey: () => overlayAccess.key,
      overlaysDir: cfg.overlaysDir,
      dashboardDir: cfg.dashboardDir,
      mediaDir: cfg.assetsDir,
    },
    rt.pino,
  );

  const lifecycle = { cfg, rt, db, reactions, projections, pipeline, supervisor, http, auth };
  return { http, logger: rt.logger, auth, ...appLifecycle({ ...lifecycle, screens, admin }) };
}

interface LifecycleParts {
  cfg: AppConfig;
  rt: Runtime;
  db: Persistence;
  reactions: Reactions;
  projections: Projections;
  pipeline: LiveEventPipeline;
  supervisor: ConnectorSupervisor;
  http: FastifyInstance;
  auth: AuthService;
  screens: ScreenSocketHub;
  admin: AdminSocketHub;
}

function appLifecycle(p: LifecycleParts): Pick<App, 'start' | 'stop'> {
  return {
    async start() {
      p.cfg.warnings.forEach((w) => p.rt.logger.warn({}, w));
      await p.db.sessions.recoverAfterRestart();
      await p.db.assets.refresh();
      await p.reactions.moderation.load();
      await p.reactions.engine.reload();
      await p.reactions.triggers.reload();
      await p.projections.leaderboards.loadSettings();
      await p.projections.goals.reload();
      p.pipeline.start();
      await p.http.listen({ port: p.cfg.port, host: p.cfg.host });
      announceSetup(p.auth, p.rt.logger, p.cfg);
      const autoTarget = p.cfg.simulate ? SIMULATOR_TARGET : p.cfg.tiktokUsername;
      if (autoTarget) void p.supervisor.connect(autoTarget);
    },
    stop: () => {
      p.projections.publisher.dispose();
      const { supervisor, pipeline, http, screens, admin } = p;
      return shutdown({ supervisor, pipeline, http, screens, admin, logger: p.rt.logger, ...p.db });
    },
  };
}

/** First run: the one-time code to create the dashboard password is shown only here. */
function announceSetup(auth: AuthService, logger: Logger, cfg: AppConfig): void {
  const code = auth.prepareSetup();
  if (!code) return;
  logger.warn(
    { setupCode: code, url: `http://localhost:${cfg.port}/admin/` },
    'Primer inicio: abre el panel y crea la contraseña con este código',
  );
}

interface ShutdownParts {
  supervisor: ConnectorSupervisor;
  pipeline: LiveEventPipeline;
  sessions: SessionService;
  http: FastifyInstance;
  screens: ScreenSocketHub;
  admin: AdminSocketHub;
  database: DatabaseHandle;
  logger: Logger;
}

/** SIGTERM: stop intake, drain with a deadline, close sockets and the database. */
async function shutdown(p: ShutdownParts): Promise<void> {
  p.logger.info({}, 'shutting down');
  await p.supervisor.stop();
  p.supervisor.dispose();
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_DRAIN_MS).unref());
  await Promise.race([p.pipeline.drain(), deadline]);
  await p.sessions.end();
  p.screens.closeAll();
  p.admin.closeAll();
  await p.http.close();
  await p.database.close();
}
