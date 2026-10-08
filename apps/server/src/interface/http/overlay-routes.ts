import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROTATOR_ID } from '../../application/projections/rotator-service.js';
import { sendProblem } from './problem.js';
import type { ProjectionServices } from './services.js';

/** Constant-time comparison of the read-only overlay token (?key=). */
export function isValidKey(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const RotatorParams = z.object({ id: z.string().regex(ROTATOR_ID) });

/**
 * Read-only data for overlays. Link/Browser sources cannot send headers, so these routes use
 * the overlay token in the query instead of the dashboard session (spec section 7).
 */
export function registerOverlayRoutes(
  app: FastifyInstance,
  p: ProjectionServices,
  overlayKey: () => string,
): void {
  app.get('/overlay-data/rotators/:id', async (req, reply) => {
    if (!isValidKey((req.query as { key?: unknown }).key, overlayKey())) {
      return sendProblem(reply, { type: 'about:blank', title: 'Unauthorized', status: 401 });
    }
    return p.rotators.get(RotatorParams.parse(req.params).id);
  });
}
