import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  SetupRequestSchema,
} from '@tiklive/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthError,
  SESSION_MAX_MS,
  type AuthService,
} from '../../application/auth/auth-service.js';
import { sendProblem } from './problem.js';

export const SESSION_COOKIE = 'tiklive_session';

/** Paths under /api/v1 reachable without a session. */
const PUBLIC_API_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/auth/status',
  '/api/v1/auth/login',
  '/api/v1/auth/setup',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const AUTH_ERROR_STATUS: Readonly<Record<AuthError['code'], number>> = {
  invalid_password: 401,
  invalid_code: 401,
  no_password: 409,
  already_set: 409,
  locked: 429,
};

const AUTH_ERROR_TEXT: Readonly<Record<AuthError['code'], string>> = {
  invalid_password: 'Contraseña incorrecta',
  invalid_code: 'Código de configuración incorrecto',
  no_password: 'Aún no hay contraseña; usa el código de configuración',
  already_set: 'La contraseña ya fue creada',
  locked: 'Demasiados intentos fallidos; espera 15 minutos',
};

export function sessionToken(req: FastifyRequest): string | undefined {
  return req.cookies[SESSION_COOKIE];
}

function setSession(reply: FastifyReply, token: string): void {
  // HttpOnly + SameSite=Strict (spec 7). No Secure flag: the panel is served over LAN http.
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_MAX_MS / 1000),
  });
}

/** Same-origin check for state-changing requests (CSRF defence in depth with SameSite). */
export function isCrossOrigin(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  if (!origin || SAFE_METHODS.has(req.method)) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

/** Guards /api/v1 (except the public paths) and /ws/admin. */
export function registerAuthGuard(app: FastifyInstance, auth: AuthService): void {
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const isApi = path.startsWith('/api/');
    if (!isApi && path !== '/ws/admin') return;
    if (isCrossOrigin(req)) {
      return sendProblem(reply, { type: 'about:blank', title: 'Origen no permitido', status: 403 });
    }
    if (PUBLIC_API_PATHS.has(path) || auth.validate(sessionToken(req))) return;
    return sendProblem(reply, { type: 'about:blank', title: 'Inicia sesión', status: 401 });
  });
}

function sendAuthError(reply: FastifyReply, error: unknown): FastifyReply {
  if (!(error instanceof AuthError)) throw error;
  return sendProblem(reply, {
    type: 'about:blank',
    title: AUTH_ERROR_TEXT[error.code],
    status: AUTH_ERROR_STATUS[error.code],
  });
}

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService): void {
  app.get('/auth/status', (req) => auth.status(sessionToken(req)));

  app.post('/auth/setup', async (req, reply) => {
    const { code, password } = SetupRequestSchema.parse(req.body);
    try {
      setSession(reply, await auth.setup(code, password));
      return { authenticated: true, setupRequired: false };
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const { password } = LoginRequestSchema.parse(req.body);
    try {
      setSession(reply, await auth.login(password, req.ip));
      return { authenticated: true, setupRequired: false };
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post('/auth/logout', (req, reply) => {
    auth.logout(sessionToken(req));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.post('/auth/password', async (req, reply) => {
    const { current, next } = ChangePasswordRequestSchema.parse(req.body);
    try {
      setSession(reply, await auth.changePassword(current, next));
      return reply.status(204).send();
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });
}
