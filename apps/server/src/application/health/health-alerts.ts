import type { ConnectorStatus, HealthAlert } from '@tiklive/contracts';
import { DEFAULT_QUEUE_CAPACITY } from '../../domain/queue/action-queue.js';

export const CONNECTOR_DOWN_AFTER_MS = 30_000;
export const QUEUE_ALERT_RATIO = 0.8;
export const DISK_LOW_PERCENT = 10;
export const BACKUP_STALE_AFTER_MS = 36 * 3_600_000;
/** The first backup check runs a minute after boot; stay quiet about backups until then. */
export const BACKUP_GRACE_MS = 5 * 60_000;
const AUDIO_SCREEN = 'audio';

export interface AlertInputs {
  readonly connector: ConnectorStatus;
  /** How long the connector has been in its current state. */
  readonly connectorStateMs: number;
  readonly screens: Readonly<Record<string, number>>;
  readonly queueDepth: Readonly<Record<string, number>>;
  readonly diskFreePercent: number | null;
  readonly lastBackupAt: number | null;
  readonly now: number;
  readonly uptimeMs: number;
}

const alert = (code: HealthAlert['code'], message: string): HealthAlert => ({ code, message });

function connectorAlerts(i: AlertInputs): HealthAlert[] {
  const { state, target } = i.connector;
  const out: HealthAlert[] = [];
  const wantsLive = target !== undefined && state !== 'stopped';
  if (wantsLive && state !== 'connected' && i.connectorStateMs > CONNECTOR_DOWN_AFTER_MS) {
    out.push(alert('connector_down', `Sin conexión con TikTok (${state})`));
  }
  if (state === 'connected' && !(i.screens[AUDIO_SCREEN] ?? 0)) {
    out.push(alert('audio_offline', 'La pestaña de audio no está conectada'));
  }
  return out;
}

function queueAlerts(i: AlertInputs): HealthAlert[] {
  const limit = DEFAULT_QUEUE_CAPACITY * QUEUE_ALERT_RATIO;
  return Object.entries(i.queueDepth)
    .filter(([, depth]) => depth > limit)
    .map(([screen, depth]) => alert('queue_full', `Cola de «${screen}» casi llena (${depth})`));
}

function storageAlerts(i: AlertInputs): HealthAlert[] {
  const out: HealthAlert[] = [];
  if (i.diskFreePercent !== null && i.diskFreePercent < DISK_LOW_PERCENT) {
    out.push(alert('disk_low', `Poco espacio en disco (${i.diskFreePercent} % libre)`));
  }
  const stale = i.lastBackupAt === null || i.now - i.lastBackupAt > BACKUP_STALE_AFTER_MS;
  if (stale && i.uptimeMs > BACKUP_GRACE_MS) {
    out.push(alert('backup_stale', 'No hay un respaldo reciente de la base de datos'));
  }
  return out;
}

/** Spec 15: alerts the dashboard shows. Pure, so every threshold is tested. */
export function healthAlerts(i: AlertInputs): HealthAlert[] {
  return [...connectorAlerts(i), ...queueAlerts(i), ...storageAlerts(i)];
}
