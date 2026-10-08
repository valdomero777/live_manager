import type { Problem } from '@tiklive/contracts';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function sendProblem(reply: FastifyReply, problem: Problem): FastifyReply {
  return reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
}

export function notFound(reply: FastifyReply, detail: string): FastifyReply {
  return sendProblem(reply, { type: 'about:blank', title: 'Not Found', status: 404, detail });
}

/** Maps any thrown error to RFC 9457; validation errors list each failing path. */
export function problemErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof ZodError) {
    return sendProblem(reply, {
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      errors: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const status =
    'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (status >= 500) request.log.error({ err: error }, 'unhandled request error');
  return sendProblem(reply, {
    type: 'about:blank',
    title: status >= 500 ? 'Internal Server Error' : error.message,
    status,
  });
}
