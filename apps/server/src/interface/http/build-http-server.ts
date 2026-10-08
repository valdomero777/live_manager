import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { API_PREFIX } from '@tiklive/contracts';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { registerSocketRoutes } from '../ws/socket-routes.js';
import { registerAssetRoutes } from './asset-routes.js';
import { registerAuthGuard, registerAuthRoutes } from './auth-routes.js';
import { registerOverlayRoutes } from './overlay-routes.js';
import { problemErrorHandler } from './problem.js';
import { registerApiRoutes } from './routes.js';
import type { HttpOptions, HttpServices } from './services.js';
import { registerSettingsRoutes } from './settings-routes.js';
import { registerTriggerRoutes } from './trigger-routes.js';

const SAFE_HOSTNAME = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])$/i;

/**
 * Pages only load from this origin; avatars come from TikTok's CDN over https. connect-src also
 * allows this same host on any port, so the panel can follow the server after a port change.
 */
export function contentSecurityPolicy(hostHeader: string | undefined): string {
  const hostname = (hostHeader ?? '').replace(/:\d+$/, '');
  const sameHostAnyPort = SAFE_HOSTNAME.test(hostname)
    ? ` http://${hostname}:* https://${hostname}:*`
    : '';
  return [
    "default-src 'self'",
    "img-src 'self' https: data:",
    "media-src 'self' blob: https://*.myinstants.com",
    `connect-src 'self' ws: wss:${sameHostAnyPort}`,
    "style-src 'self' 'unsafe-inline'",
  ].join('; ');
}

/** Vite emits content-hashed names under assets/; the path uses OS separators. */
const HASHED_ASSET = /[\\/]assets[\\/].+-[\w-]{8,}\.(js|css)$/;
/** Angular emits main-XXXXXXXX.js, chunk-XXXXXXXX.js, styles-XXXXXXXX.css. */
const HASHED_BUNDLE = /-[A-Z0-9]{8}\.(js|css)$/;
const DASHBOARD_PREFIX = '/admin/';

function cacheHeaders(hashed: RegExp) {
  return (res: { setHeader(name: string, value: string): unknown }, path: string) => {
    const immutable = hashed.test(path);
    res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  };
}

export async function buildHttpServer(
  services: HttpServices,
  options: HttpOptions,
  logger: FastifyBaseLogger,
): Promise<FastifyInstance> {
  // Request logging stays off: overlay socket URLs carry the ?key= token.
  const app = Fastify({
    loggerInstance: logger,
    logController: new LogController({ disableRequestLogging: true }),
    // Shutdown drains events first; lingering keep-alive sockets (the panel polling /health
    // during a restart) must not hold the old instance open.
    forceCloseConnections: true,
  });
  app.setErrorHandler(problemErrorHandler);
  app.addHook('onSend', (req, reply, payload, done) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) {
      reply.header('Content-Security-Policy', contentSecurityPolicy(req.headers.host));
    }
    done(null, payload);
  });

  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });
  registerAuthGuard(app, services.auth);
  await app.register(
    async (api) => {
      registerAuthRoutes(api, services.auth);
      registerApiRoutes(api, services);
      registerSettingsRoutes(api, services);
      registerTriggerRoutes(api, services);
      await registerAssetRoutes(api, services);
    },
    { prefix: API_PREFIX },
  );
  registerSocketRoutes(app, services, {
    overlayKey: options.overlayKey,
    preloadUrls: () => services.assets.audioUrls(),
  });
  registerOverlayRoutes(app, services.projections, options.overlayKey);
  await registerStaticFiles(app, options, logger);
  return app;
}

async function registerStaticFiles(
  app: FastifyInstance,
  options: HttpOptions,
  logger: FastifyBaseLogger,
): Promise<void> {
  await registerDashboard(app, options.dashboardDir, logger);
  await app.register(fastifyStatic, {
    root: options.mediaDir,
    prefix: '/media/',
    decorateReply: false,
    immutable: true,
    maxAge: '30d',
  });
  if (!options.overlaysDir || !existsSync(options.overlaysDir)) {
    logger.warn(
      { overlaysDir: options.overlaysDir },
      'overlays build not found; run npm run build -w @tiklive/overlays',
    );
    return;
  }
  await app.register(fastifyStatic, {
    root: options.overlaysDir,
    prefix: '/',
    redirect: true,
    decorateReply: false,
    setHeaders: cacheHeaders(HASHED_ASSET),
  });
}

/** Angular dashboard at /admin/ with SPA fallback; the site root redirects to it. */
async function registerDashboard(
  app: FastifyInstance,
  dir: string | undefined,
  logger: FastifyBaseLogger,
): Promise<void> {
  app.get('/', (_req, reply) => reply.redirect(DASHBOARD_PREFIX));
  if (!dir || !existsSync(dir)) {
    logger.warn(
      { dashboardDir: dir },
      'dashboard build not found; run npm run build -w @tiklive/dashboard',
    );
    return;
  }
  await app.register(fastifyStatic, {
    root: dir,
    prefix: DASHBOARD_PREFIX,
    redirect: true,
    setHeaders: cacheHeaders(HASHED_BUNDLE),
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && req.url.startsWith(DASHBOARD_PREFIX)) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html', dir);
    }
    return reply.status(404).send({ type: 'about:blank', title: 'Not Found', status: 404 });
  });
}
