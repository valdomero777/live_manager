import {
  GoalDefinitionSchema,
  LeaderboardResetSchema,
  LeaderboardSettingsSchema,
  MAX_LEADERBOARD_LIMIT,
  MetricSchema,
  RotatorConfigSchema,
  ScopeSchema,
} from '@tiklive/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROTATOR_ID } from '../../application/projections/rotator-service.js';
import { notFound } from './problem.js';
import type { ProjectionServices } from './services.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const RotatorParams = z.object({ id: z.string().regex(ROTATOR_ID) });
const LeaderboardQuery = z.object({
  scope: ScopeSchema.default('session'),
  limit: z.coerce.number().int().min(1).max(MAX_LEADERBOARD_LIMIT).default(10),
});

/** Admin API for leaderboards, goals, stats and rotators (spec section 7, /api/v1). */
export function registerProjectionRoutes(app: FastifyInstance, p: ProjectionServices): void {
  registerLeaderboardRoutes(app, p);
  registerGoalRoutes(app, p);

  app.get('/stats', () => p.stats.snapshot());

  app.get('/rotators/:id', (req) => p.rotators.get(RotatorParams.parse(req.params).id));
  app.put('/rotators/:id', (req) =>
    p.rotators.save(RotatorParams.parse(req.params).id, RotatorConfigSchema.parse(req.body)),
  );
}

function registerLeaderboardRoutes(app: FastifyInstance, p: ProjectionServices): void {
  app.get('/leaderboards/:metric', async (req) => {
    const metric = MetricSchema.parse((req.params as { metric?: string }).metric);
    const { scope, limit } = LeaderboardQuery.parse(req.query);
    return { metric, scope, rows: await p.leaderboards.top(metric, scope, limit) };
  });

  app.post('/leaderboards/reset', async (req) => {
    const { scope } = LeaderboardResetSchema.parse(req.body);
    const removed = await p.leaderboards.reset(scope);
    p.publisher.refreshAll();
    return { scope, removed };
  });

  app.get('/settings/leaderboard', () => p.leaderboards.settings());
  app.put('/settings/leaderboard', async (req) => {
    await p.leaderboards.updateSettings(LeaderboardSettingsSchema.parse(req.body));
    p.publisher.refreshAll();
    return p.leaderboards.settings();
  });
}

function registerGoalRoutes(app: FastifyInstance, p: ProjectionServices): void {
  app.get('/goals', () => p.goals.list());

  app.post('/goals', async (req, reply) => {
    const goal = await p.goals.create(GoalDefinitionSchema.parse(req.body));
    p.publisher.markDirty(`goal:${goal.id}`);
    return reply.status(201).send(goal);
  });

  app.get('/goals/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const goal = p.goals.get(id);
    if (!goal) return notFound(reply, `goal ${id}`);
    return { ...goal, progress: await p.goals.progress(id) };
  });

  app.put('/goals/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const goal = await p.goals.update(id, GoalDefinitionSchema.parse(req.body));
    if (!goal) return notFound(reply, `goal ${id}`);
    p.publisher.markDirty(`goal:${id}`);
    return goal;
  });

  app.delete('/goals/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await p.goals.delete(id);
    return reply.status(204).send();
  });
}
