import type { ServerActionConfig } from '@tiklive/contracts';
import { CircuitBreaker } from '../../domain/webhook/circuit-breaker.js';
import {
  resolveJsonTemplate,
  resolveTemplate,
  type TemplateVariables,
} from '../../domain/rules/template.js';
import type { Clock } from '../../domain/shared/time.js';
import type { AdminNotifier } from '../ports/admin-notifier.js';
import type { Logger } from '../ports/logger.js';
import { SpotifyError } from '../ports/spotify-client.js';
import { SpotifyConnectionError } from '../spotify/spotify-service.js';
import type { WebhookClient } from '../ports/webhook-client.js';

/** What the runner needs from goals; GoalService implements it. */
export interface GoalAdjuster {
  adjust(goalId: number, amount: number, eventId: string): Promise<boolean>;
}

/** What the runner needs from Spotify; SpotifyService implements it. */
export interface SpotifyPlaybackControl {
  canControlPlayback(): boolean;
  queueSong(
    query: string,
    policy: { allowExplicit: boolean; maxDurationMs: number },
  ): Promise<{ title: string; artists: readonly string[] } | undefined>;
  skip(): Promise<void>;
}

/** Longest search text sent to Spotify. */
export const SONG_QUERY_MAX = 200;

/** Shown in the panel when a Spotify action could not run; the stream itself shows nothing. */
const SPOTIFY_FAILURE_TEXT: Readonly<Record<string, string>> = {
  no_device: 'Abre Spotify y pon algo a sonar: no hay un dispositivo activo',
  forbidden: 'Spotify rechazó el control de la reproducción (¿Premium? ¿vuelve a conectar?)',
  rate_limited: 'Spotify pidió esperar',
  unavailable: 'Spotify no responde',
  invalid_grant: 'Spotify no está conectado; conéctalo en Ajustes',
  unauthorized: 'Spotify no está conectado; conéctalo en Ajustes',
  not_connected: 'Spotify no está conectado; conéctalo en Ajustes',
  not_configured: 'Falta el Client ID de Spotify en Ajustes',
  busy: 'Demasiadas peticiones a Spotify en el último minuto; se ignoró una',
};

export interface ServerActionContext {
  readonly vars: TemplateVariables;
  readonly eventId: string;
  readonly ruleId: number;
}

interface RunnerDeps {
  readonly goals: GoalAdjuster;
  readonly webhook: WebhookClient;
  readonly spotify: SpotifyPlaybackControl;
  readonly notifier: AdminNotifier;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Runs the actions that have no screen (spec 9): updateGoal, webhook and the Spotify song
 * request / skip (ADR 0014). Fire and forget: the
 * ingest path never waits on the network, and a failure is logged without touching other actions.
 */
export class ServerActionRunner {
  private readonly breaker: CircuitBreaker;

  constructor(private readonly deps: RunnerDeps) {
    this.breaker = new CircuitBreaker(deps.clock);
  }

  /** True if the action was started; false if it was refused before doing anything. */
  run(action: ServerActionConfig, ctx: ServerActionContext): boolean {
    switch (action.type) {
      case 'updateGoal':
        return this.updateGoal(action, ctx);
      case 'webhook':
        return this.webhook(action, ctx);
      case 'spotifyQueue':
        return this.spotifyQueue(action, ctx);
      case 'spotifySkip':
        return this.spotifySkip(ctx);
    }
  }

  private spotifyQueue(
    action: Extract<ServerActionConfig, { type: 'spotifyQueue' }>,
    ctx: ServerActionContext,
  ): boolean {
    const query = resolveTemplate(action.query, ctx.vars).trim().slice(0, SONG_QUERY_MAX);
    // An unknown {placeholder} left in the text is a misconfigured rule, not a song name.
    if (query === '' || /\{\w+\}/.test(query)) {
      this.deps.logger.warn({ ruleId: ctx.ruleId }, 'song request has no usable search text');
      return false;
    }
    if (!this.deps.spotify.canControlPlayback()) {
      this.deps.logger.warn({ ruleId: ctx.ruleId }, 'song request skipped: Spotify not connected');
      return false;
    }
    const policy = {
      allowExplicit: action.allowExplicit,
      maxDurationMs: action.maxDurationS * 1000,
    };
    this.deps.spotify
      .queueSong(query, policy)
      .then((track) => {
        if (track) {
          this.deps.logger.info(
            { ruleId: ctx.ruleId, title: track.title, artists: track.artists },
            'song request queued',
          );
        } else {
          this.deps.logger.info({ ruleId: ctx.ruleId }, 'song request: no acceptable song found');
        }
      })
      .catch((error: unknown) => this.spotifyFailed('spotifyQueue', error, ctx));
    return true;
  }

  private spotifySkip(ctx: ServerActionContext): boolean {
    if (!this.deps.spotify.canControlPlayback()) {
      this.deps.logger.warn({ ruleId: ctx.ruleId }, 'skip ignored: Spotify not connected');
      return false;
    }
    this.deps.spotify
      .skip()
      .then(() => this.deps.logger.info({ ruleId: ctx.ruleId }, 'spotify song skipped'))
      .catch((error: unknown) => this.spotifyFailed('spotifySkip', error, ctx));
    return true;
  }

  /** Logged, and shown in the panel when the streamer can fix it (no device, no Premium). */
  private spotifyFailed(action: string, error: unknown, ctx: ServerActionContext): void {
    const reason =
      error instanceof SpotifyError
        ? error.reason
        : error instanceof SpotifyConnectionError
          ? error.code
          : 'error';
    this.deps.logger.warn(
      { ruleId: ctx.ruleId, action, reason, err: String(error) },
      'spotify action failed',
    );
    const message = SPOTIFY_FAILURE_TEXT[reason];
    if (message) this.deps.notifier.publish('error.reported', { module: 'spotify', message });
  }

  private updateGoal(
    action: Extract<ServerActionConfig, { type: 'updateGoal' }>,
    ctx: ServerActionContext,
  ): boolean {
    this.deps.goals
      .adjust(action.goalId, action.amount, ctx.eventId)
      .then((found) => {
        if (!found)
          this.deps.logger.warn({ ruleId: ctx.ruleId, goalId: action.goalId }, 'goal not found');
      })
      .catch((error: unknown) =>
        this.deps.logger.error({ ruleId: ctx.ruleId, err: String(error) }, 'updateGoal failed'),
      );
    return true;
  }

  private webhook(
    action: Extract<ServerActionConfig, { type: 'webhook' }>,
    ctx: ServerActionContext,
  ): boolean {
    const host = new URL(action.url).host;
    const fields = { ruleId: ctx.ruleId, host };
    const body = resolveJsonTemplate(action.body, ctx.vars);
    if (body === undefined) {
      this.deps.logger.warn(fields, 'webhook body is not valid JSON after substitution');
      return false;
    }
    if (!this.deps.webhook.isAllowed(action.url)) {
      this.deps.logger.warn(fields, 'webhook destination is not allowed');
      return false;
    }
    if (!this.breaker.canCall(host)) {
      this.deps.logger.warn(fields, 'webhook skipped: circuit open');
      return false;
    }
    this.deps.webhook
      .send({ url: action.url, method: action.method, body })
      .then(() => this.breaker.recordSuccess(host))
      .catch((error: unknown) => {
        this.breaker.recordFailure(host);
        this.deps.logger.warn({ ...fields, err: String(error) }, 'webhook failed');
      });
    return true;
  }
}
