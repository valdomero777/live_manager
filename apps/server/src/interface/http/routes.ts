import {
  ConnectRequestSchema,
  RawLiveEventSchema,
  RuleDefinitionSchema,
  RuleTestRequestSchema,
  SimulatorTemplateSchema,
} from '@tiklive/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerProjectionRoutes } from './projection-routes.js';
import type { HttpServices } from './services.js';
import { notFound } from './problem.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const SimulatorBody = z.union([z.object({ raw: RawLiveEventSchema }), SimulatorTemplateSchema]);
const IDEMPOTENCY_HEADER = 'idempotency-key';

export function registerApiRoutes(app: FastifyInstance, s: HttpServices): void {
  app.get('/health', async (_req, reply) => {
    const health = s.health.check();
    return reply.status(health.db === 'ok' ? 200 : 503).send(health);
  });

  registerConnectorRoutes(app, s);
  registerRuleRoutes(app, s);
  registerProjectionRoutes(app, s.projections);

  app.get('/events/recent', (req) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(500).default(200) })
      .parse(req.query);
    return s.recentEvents(limit);
  });

  app.post('/simulator/emit', async (req, reply) => {
    const body = SimulatorBody.parse(req.body);
    if ('raw' in body) {
      s.simulator.emitRaw(body.raw);
      return reply.status(202).send({ emitted: 1 });
    }
    const key = req.headers[IDEMPOTENCY_HEADER];
    const emitted = s.simulator.emitTemplate(body, typeof key === 'string' ? key : undefined);
    return reply.status(202).send({ emitted: emitted.length });
  });

  app.get('/gifts', (req) => {
    const { refresh } = z.object({ refresh: z.stringbool().default(false) }).parse(req.query);
    return s.gifts.get(refresh);
  });

  app.post('/queue/clear', (req) => {
    const screen = z.object({ screen: z.string().optional() }).parse(req.body ?? {}).screen;
    return { cleared: s.actions.clear(screen) };
  });
}

function registerConnectorRoutes(app: FastifyInstance, s: HttpServices): void {
  app.get('/connector', () => s.supervisor.status());

  app.post('/connector/connect', async (req, reply) => {
    const { username } = ConnectRequestSchema.parse(req.body);
    // Connection attempts can take seconds; progress is reported over /ws/admin.
    void s.supervisor.connect(username);
    return reply.status(202).send(s.supervisor.status());
  });

  app.post('/connector/disconnect', async () => {
    await s.supervisor.stop();
    return s.supervisor.status();
  });
}

function registerRuleRoutes(app: FastifyInstance, s: HttpServices): void {
  app.get('/rules', () => s.rules.list());

  app.post('/rules', async (req, reply) => {
    const rule = await s.rules.create(RuleDefinitionSchema.parse(req.body));
    return reply.status(201).send(rule);
  });

  app.get('/rules/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    return (await s.rules.get(id)) ?? notFound(reply, `rule ${id}`);
  });

  app.put('/rules/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const rule = await s.rules.update(id, RuleDefinitionSchema.parse(req.body));
    return rule ?? notFound(reply, `rule ${id}`);
  });

  app.post('/rules/:id/test', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const result = await s.rules.test(id, RuleTestRequestSchema.parse(req.body ?? {}));
    return result ?? notFound(reply, `rule ${id}`);
  });

  app.delete('/rules/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await s.rules.delete(id);
    return reply.status(204).send();
  });
}
