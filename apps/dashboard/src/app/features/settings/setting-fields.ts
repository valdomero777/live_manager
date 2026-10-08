import {
  LOG_LEVELS,
  type ApplyMode,
  type SettingKey,
  type SettingSource,
} from '@tiklive/contracts';

export type FieldKind = 'text' | 'number' | 'boolean' | 'select' | 'secret';

export interface FieldDefinition {
  readonly key: SettingKey;
  readonly label: string;
  readonly help: string;
  readonly kind: FieldKind;
  readonly options?: readonly { value: string; label: string }[];
}

export interface FieldSection {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly fields: readonly FieldDefinition[];
}

const LOG_LABELS: Readonly<Record<(typeof LOG_LEVELS)[number], string>> = {
  fatal: 'Solo fallos fatales',
  error: 'Errores',
  warn: 'Advertencias',
  info: 'Normal (recomendado)',
  debug: 'Detallado (diagnóstico)',
  trace: 'Todo (muy verboso)',
};

/** UI texts for every setting, grouped. The order here is the order on screen. */
export const SETTING_SECTIONS: readonly FieldSection[] = [
  {
    id: 'tiktok',
    title: 'TikTok',
    description: 'Cuenta a la que se conecta el sistema y modo de ensayo.',
    fields: [
      {
        key: 'tiktokUsername',
        label: 'Usuario de TikTok',
        help: 'Sin @. Al guardar, el conector se reconecta a esta cuenta. Vacío = no conectar al arrancar.',
        kind: 'text',
      },
      {
        key: 'simulate',
        label: 'Modo simulador',
        help: 'Ensaya sin estar en vivo: los eventos solo llegan desde el simulador.',
        kind: 'boolean',
      },
      {
        key: 'signApiKey',
        label: 'Clave de Euler Stream (opcional)',
        help: 'Solo si el conector la necesita para firmar. Déjala vacía para no cambiarla.',
        kind: 'secret',
      },
    ],
  },
  {
    id: 'overlays',
    title: 'Overlays',
    description: 'Clave de solo lectura que va en las URLs de los overlays (?key=).',
    fields: [
      {
        key: 'overlayKey',
        label: 'Clave de overlays',
        help: 'Al cambiarla, las URLs anteriores dejan de funcionar al instante y debes pegar las nuevas en LIVE Studio/OBS.',
        kind: 'text',
      },
    ],
  },
  {
    id: 'server',
    title: 'Servidor',
    description: 'Dónde escucha el servidor. Un valor incorrecto se revierte solo al reiniciar.',
    fields: [
      {
        key: 'port',
        label: 'Puerto',
        help: 'Puerto HTTP para el panel, los overlays y la API.',
        kind: 'number',
      },
      {
        key: 'host',
        label: 'Interfaz de red',
        help: '0.0.0.0 = toda la red local; 127.0.0.1 = solo esta máquina.',
        kind: 'text',
      },
    ],
  },
  {
    id: 'storage',
    title: 'Almacenamiento',
    description: 'Rutas en disco, relativas a la carpeta del proyecto o absolutas.',
    fields: [
      {
        key: 'dbPath',
        label: 'Base de datos',
        help: 'Archivo SQLite con eventos, reglas y rankings.',
        kind: 'text',
      },
      {
        key: 'assetsDir',
        label: 'Carpeta de assets',
        help: 'Sonidos e imágenes subidos.',
        kind: 'text',
      },
      {
        key: 'overlaysDir',
        label: 'Carpeta de overlays compilados',
        help: 'Normalmente no hace falta cambiarla.',
        kind: 'text',
      },
    ],
  },
  {
    id: 'logging',
    title: 'Registro',
    description: 'Cuánto detalle escribe el servidor en su log.',
    fields: [
      {
        key: 'logLevel',
        label: 'Nivel de log',
        help: 'Se aplica al instante.',
        kind: 'select',
        options: LOG_LEVELS.map((l) => ({ value: l, label: LOG_LABELS[l] })),
      },
    ],
  },
];

export const APPLY_LABELS: Readonly<Record<ApplyMode, string>> = {
  live: 'Se aplica al instante',
  reconnect: 'Reconecta con TikTok',
  restart: 'Requiere reinicio',
};

export function sourceLabel(source: SettingSource, env: string): string {
  if (source === 'ui') return 'Guardado en el panel';
  if (source === 'env') return `Variable de entorno ${env}`;
  return 'Valor por defecto';
}
