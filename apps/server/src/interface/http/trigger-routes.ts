import {
  SOUND_PAGE_MAX,
  SOUND_QUERY_MAX,
  SOUND_SOURCE_LABELS,
  SoundSourceSchema,
  TriggerDefinitionRequestSchema,
  type SoundSearchResult,
  type SoundSource,
} from '@tiklive/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SoundSourceError } from '../../application/ports/sound-provider.js';
import { notFound, sendProblem } from './problem.js';
import type { HttpServices } from './services.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const SearchQuery = z.object({
  q: z.string().trim().min(1).max(SOUND_QUERY_MAX),
  page: z.coerce.number().int().min(1).max(SOUND_PAGE_MAX).default(1),
  source: SoundSourceSchema.default('myinstants'),
});
const PopularQuery = z.object({
  page: z.coerce.number().int().min(1).max(SOUND_PAGE_MAX).default(1),
  source: SoundSourceSchema.default('myinstants'),
});

/**
 * What the dashboard shows when a catalogue fails. Technical details were already logged by the
 * provider; a missing or rejected key is something the user can fix, so it says where.
 */
function searchProblem(error: SoundSourceError, source: SoundSource) {
  const label = SOUND_SOURCE_LABELS[source];
  return error.reason === 'not_configured'
    ? { title: `Para buscar en ${label} agrega tu clave de API en Ajustes.`, status: 503 }
    : { title: `No se pudieron cargar los sonidos de ${label}. Intenta nuevamente.`, status: 502 };
}

/** Answers with a catalogue call; a provider failure becomes the problem the dashboard shows. */
async function answerCatalogue(
  reply: FastifyReply,
  source: SoundSource,
  call: () => Promise<SoundSearchResult>,
) {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof SoundSourceError)) throw error;
    return sendProblem(reply, { type: 'about:blank', ...searchProblem(error, source) });
  }
}

/** Sound search (proxy to the provider) and sound-trigger CRUD. All behind the admin session. */
export function registerTriggerRoutes(app: FastifyInstance, s: HttpServices): void {
  app.get('/sounds/search', (req, reply) => {
    const { q, page, source } = SearchQuery.parse(req.query);
    return answerCatalogue(reply, source, () => s.sounds.search(source, q, page));
  });

  /** Most downloaded sounds (empty for catalogues without that list). */
  app.get('/sounds/popular', (req, reply) => {
    const { page, source } = PopularQuery.parse(req.query);
    return answerCatalogue(reply, source, () => s.sounds.popular(source, page));
  });

  app.get('/triggers', () => s.triggers.list());

  app.post('/triggers', async (req, reply) => {
    const trigger = await s.triggers.create(TriggerDefinitionRequestSchema.parse(req.body));
    return reply.status(201).send(trigger);
  });

  app.get('/triggers/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    return (await s.triggers.get(id)) ?? notFound(reply, `trigger ${id}`);
  });

  app.put('/triggers/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const trigger = await s.triggers.update(id, TriggerDefinitionRequestSchema.parse(req.body));
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
