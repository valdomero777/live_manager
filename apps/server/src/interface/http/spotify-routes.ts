import { SPOTIFY_CALLBACK_PATH, SpotifyCompleteRequestSchema } from '@tiklive/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SpotifyError } from '../../application/ports/spotify-client.js';
import {
  SpotifyConnectionError,
  type SpotifyConnectionFailure,
  type SpotifyService,
} from '../../application/spotify/spotify-service.js';
import { isValidKey } from './overlay-routes.js';
import { sendProblem } from './problem.js';

/** Where the redirect lands in the panel; the query tells it what happened. */
const SETTINGS_PAGE = '/admin/ajustes';

const CONNECTION_ERROR: Readonly<
  Record<SpotifyConnectionFailure, { status: number; title: string }>
> = {
  not_configured: { status: 409, title: 'Falta el Client ID de Spotify en Ajustes' },
  not_connected: { status: 409, title: 'Spotify no está conectado; conéctalo en Ajustes' },
  busy: { status: 429, title: 'Demasiadas peticiones a Spotify en el último minuto' },
  invalid_state: {
    status: 400,
    title: 'El inicio de sesión con Spotify caducó o no se inició aquí; vuelve a intentarlo',
  },
  denied: { status: 400, title: 'No se dio permiso en Spotify' },
  invalid_callback: { status: 400, title: 'La dirección pegada no es la de vuelta de Spotify' },
};

/** Maps service errors to problem details; anything else is a real 500. */
function sendSpotifyError(req: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof SpotifyConnectionError) {
    const { status, title } = CONNECTION_ERROR[error.code];
    return sendProblem(reply, { type: 'about:blank', title, status });
  }
  if (!(error instanceof SpotifyError)) throw error;
  req.log.warn({ reason: error.reason }, 'spotify.request_failed');
  if (error.reason === 'rate_limited') {
    reply.header('Retry-After', String(Math.ceil((error.retryAfterMs ?? 5_000) / 1000)));
    return sendProblem(reply, {
      type: 'about:blank',
      title: 'Spotify pidió esperar',
      status: 429,
    });
  }
  if (error.reason === 'invalid_grant') {
    return sendProblem(reply, {
      type: 'about:blank',
      title: 'Spotify rechazó el código; vuelve a conectar',
      status: 400,
    });
  }
  return sendProblem(reply, { type: 'about:blank', title: 'Spotify no responde', status: 502 });
}

/** Panel routes under /api/v1 (session auth). */
export function registerSpotifyApiRoutes(app: FastifyInstance, spotify: SpotifyService): void {
  app.get('/spotify/status', () => spotify.status());

  app.post('/spotify/authorize', (req, reply) => {
    try {
      return spotify.startAuthorization();
    } catch (error) {
      return sendSpotifyError(req, reply, error);
    }
  });

  app.post('/spotify/complete', async (req, reply) => {
    const { callbackUrl } = SpotifyCompleteRequestSchema.parse(req.body);
    try {
      return await spotify.completeFromUrl(callbackUrl);
    } catch (error) {
      return sendSpotifyError(req, reply, error);
    }
  });

  app.delete('/spotify/connection', async (_req, reply) => {
    await spotify.disconnect();
    return reply.status(204).send();
  });

  app.get('/spotify/now-playing', async (req, reply) => {
    try {
      return await spotify.nowPlaying();
    } catch (error) {
      return sendSpotifyError(req, reply, error);
    }
  });
}

const CallbackQuery = z.object({
  code: z.string().max(2000).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});

/**
 * Public routes: Spotify's redirect (it carries no panel cookie when the panel was opened by LAN
 * IP, so it is authorised by the single-use `state` instead) and the overlay's read-only data.
 */
export function registerSpotifyPublicRoutes(
  app: FastifyInstance,
  spotify: SpotifyService,
  overlayKey: () => string,
): void {
  app.get(SPOTIFY_CALLBACK_PATH, async (req, reply) => {
    const query = CallbackQuery.safeParse(req.query);
    let outcome = 'connected';
    try {
      if (!query.success) throw new SpotifyConnectionError('invalid_callback');
      await spotify.completeAuthorization(query.data);
    } catch (error) {
      if (error instanceof SpotifyConnectionError) outcome = error.code;
      else if (error instanceof SpotifyError) outcome = 'failed';
      else throw error;
      req.log.warn({ outcome }, 'spotify.callback_failed');
    }
    return reply.redirect(`${SETTINGS_PAGE}?spotify=${outcome}`);
  });

  app.get('/overlay-data/spotify/now-playing', async (req, reply) => {
    if (!isValidKey((req.query as { key?: unknown }).key, overlayKey())) {
      return sendProblem(reply, { type: 'about:blank', title: 'Unauthorized', status: 401 });
    }
    try {
      return await spotify.nowPlaying();
    } catch (error) {
      return sendSpotifyError(req, reply, error);
    }
  });
}
