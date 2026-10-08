import fastifyMultipart from '@fastify/multipart';
import { ASSET_MAX_BYTES } from '@tiklive/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AssetError, type AssetErrorCode } from '../../application/assets/asset-service.js';
import { sendProblem } from './problem.js';
import type { HttpServices } from './services.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const MAX_UPLOAD_BYTES = Math.max(...Object.values(ASSET_MAX_BYTES));

const STATUS: Readonly<Record<AssetErrorCode, number>> = {
  unsupported: 415,
  too_large: 413,
  in_use: 409,
  not_found: 404,
};

function sendAssetError(reply: FastifyReply, error: unknown): FastifyReply {
  if (!(error instanceof AssetError)) throw error;
  return sendProblem(reply, {
    type: 'about:blank',
    title: error.message,
    status: STATUS[error.code],
  });
}

/** Asset library (RF-19): list, upload (multipart field "file") and delete when unused. */
export async function registerAssetRoutes(app: FastifyInstance, s: HttpServices): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
    throwFileSizeLimit: true,
  });

  app.get('/assets', () => s.assetService.list());

  app.post('/assets', async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return sendProblem(reply, { type: 'about:blank', title: 'Falta el archivo', status: 400 });
    }
    try {
      const content = await file.toBuffer();
      return reply.status(201).send(await s.assetService.upload(file.filename, content));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
        const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
        return sendProblem(reply, {
          type: 'about:blank',
          title: `El archivo supera ${mb} MB`,
          status: 413,
        });
      }
      return sendAssetError(reply, error);
    }
  });

  app.delete('/assets/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    try {
      await s.assetService.delete(id);
      return reply.status(204).send();
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });
}
