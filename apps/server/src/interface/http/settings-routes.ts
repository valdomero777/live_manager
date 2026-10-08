import { networkInterfaces } from 'node:os';
import { ModerationSettingsSchema, SettingsPatchSchema } from '@tiklive/contracts';
import type { FastifyInstance } from 'fastify';
import type { HttpServices } from './services.js';

/** Restart is delayed so the HTTP response reaches the browser first. */
const RESTART_DELAY_MS = 300;

/** IPv4 addresses other devices on the LAN can use to reach this server. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i !== undefined && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}

/** Every former environment variable plus TTS moderation, editable from the dashboard. */
export function registerSettingsRoutes(app: FastifyInstance, s: HttpServices): void {
  app.get('/settings', () => s.settings.view());

  app.patch('/settings', (req) => s.settings.update(SettingsPatchSchema.parse(req.body)));

  app.post('/settings/overlay-key/rotate', () => s.settings.rotateOverlayKey());

  app.post('/settings/restart', (_req, reply) => {
    setTimeout(() => s.settings.restart(), RESTART_DELAY_MS).unref();
    return reply.status(202).send({ restarting: true });
  });

  app.get('/settings/addresses', () => ({ addresses: lanAddresses() }));

  app.get('/settings/moderation', () => s.moderation.get());
  app.put('/settings/moderation', (req) =>
    s.moderation.update(ModerationSettingsSchema.parse(req.body)),
  );
}
