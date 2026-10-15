import { TtsSettingsSchema, TtsSpeechRequestSchema } from '@tiklive/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SpeechSynthesisError } from '../../application/ports/speech-synthesizer.js';
import type { TtsService } from '../../application/tts/tts-service.js';
import { sendProblem } from './problem.js';
import type { HttpServices } from './services.js';

/** The audio screen reads one action at a time; more than this in flight is abuse. */
const MAX_SYNTHESIS_IN_FLIGHT = 2;

/**
 * POST body -> MP3. Shared by the dashboard preview and the audio screen. The text travels in
 * the body, never in the URL, so it does not end up in access logs.
 */
export function speechHandler(tts: TtsService) {
  let inFlight = 0;
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const request = TtsSpeechRequestSchema.parse(req.body);
    if (inFlight >= MAX_SYNTHESIS_IN_FLIGHT) {
      return sendProblem(reply, { type: 'about:blank', title: 'Too Many Requests', status: 429 });
    }
    inFlight++;
    try {
      const audio = await tts.synthesize(request);
      return await reply
        .type('audio/mpeg')
        .header('Cache-Control', 'no-store')
        .send(Buffer.from(audio));
    } catch (error) {
      if (!(error instanceof SpeechSynthesisError)) throw error;
      req.log.warn({ err: error }, 'tts.synthesis_failed');
      return sendProblem(reply, { type: 'about:blank', title: error.message, status: 502 });
    } finally {
      inFlight--;
    }
  };
}

/** TTS settings, the Edge voice catalogue and a preview for the dashboard (session auth). */
export function registerTtsRoutes(app: FastifyInstance, s: HttpServices): void {
  app.get('/settings/tts', () => s.tts.get());
  app.put('/settings/tts', (req) => s.tts.update(TtsSettingsSchema.parse(req.body)));

  app.get('/tts/voices', async (req, reply) => {
    try {
      return await s.tts.voices();
    } catch (error) {
      if (!(error instanceof SpeechSynthesisError)) throw error;
      req.log.warn({ err: error }, 'tts.voices_failed');
      return sendProblem(reply, { type: 'about:blank', title: error.message, status: 502 });
    }
  });

  app.post('/tts/preview', speechHandler(s.tts));
}
