import { SOUND_PAGE_MAX, SOUND_QUERY_MAX, TriggerDefinitionSchema } from '@tiklive/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SoundSourceError } from '../../application/ports/sound-provider.js';
import { notFound, sendProblem } from './problem.js';
import type { HttpServices } from './services.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const SearchQuery = z.object({
  q: z.string().trim().min(1).max(SOUND_QUERY_MAX),
  page: z.coerce.number().int().min(1).max(SOUND_PAGE_MAX).default(1),
});

/** Sound search (proxy to the provider) and sound-trigger CRUD. All behind the admin session. */
export function registerTriggerRoutes(app: FastifyInstance, s: HttpServices): void {
  app.get('/sounds/search', async (req, reply) => {
    const { q, page } = SearchQuery.parse(req.query);
    try {
      return await s.sounds.search(q, page);
    } catch (error) {
      if (!(error instanceof SoundSourceError)) throw error;
      // Technical details were already logged by the provider; the client only gets this text.
      return sendProblem(reply, {
        type: 'about:blank',
        title: 'No se pudieron cargar los sonidos. Intenta nuevamente.',
        status: 502,
      });
    }
  });

  app.get('/triggers', () => s.triggers.list());

  app.post('/triggers', async (req, reply) => {
    const trigger = await s.triggers.create(TriggerDefinitionSchema.parse(req.body));
    return reply.status(201).send(trigger);
  });

  app.get('/triggers/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    return (await s.triggers.get(id)) ?? notFound(reply, `trigger ${id}`);
  });

  app.put('/triggers/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const trigger = await s.triggers.update(id, TriggerDefinitionSchema.parse(req.body));
    return trigger ?? notFound(reply, `trigger ${id}`);
  });

  app.delete('/triggers/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await s.triggers.delete(id))) return notFound(reply, `trigger ${id}`);
    return reply.status(204).send();
  });

  /** Sends the saved sound to the audio screen. Takes no URL: only a stored trigger can play. */
  app.post('/triggers/:id/test', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    return (await s.triggers.test(id)) ?? notFound(reply, `trigger ${id}`);
  });
}
