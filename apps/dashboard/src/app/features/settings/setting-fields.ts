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
  fatal: $localize`Solo fallos fatales`,
  error: $localize`Errores`,
  warn: $localize`Advertencias`,
  info: $localize`Normal (recomendado)`,
  debug: $localize`Detallado (diagnóstico)`,
  trace: $localize`Todo (muy verboso)`,
};

/** UI texts for every setting, grouped. The order here is the order on screen. */
export const SETTING_SECTIONS: readonly FieldSection[] = [
  {
    id: 'tiktok',
    title: $localize`TikTok`,
    description: $localize`Cuenta a la que se conecta el sistema y modo de ensayo.`,
    fields: [
      {
        key: 'tiktokUsername',
        label: $localize`Usuario de TikTok`,
        help: $localize`Sin @. Al guardar, el conector se reconecta a esta cuenta. Vacío = no conectar al arrancar.`,
        kind: 'text',
      },
      {
        key: 'simulate',
        label: $localize`Modo simulador`,
        help: $localize`Ensaya sin estar en vivo: los eventos solo llegan desde el simulador.`,
        kind: 'boolean',
      },
      {
        key: 'signApiKey',
        label: $localize`Clave de Euler Stream (opcional)`,
        help: $localize`Solo si el conector la necesita para firmar. Déjala vacía para no cambiarla.`,
        kind: 'secret',
      },
    ],
  },
  {
    id: 'sounds',
    title: $localize`Sonidos`,
    description: $localize`Catálogos externos donde buscar sonidos para los triggers.`,
    fields: [
      {
        key: 'freesoundApiKey',
        label: $localize`Clave de API de Freesound (opcional)`,
        help: $localize`Gratis en freesound.org/apiv2/apply. Sin ella solo se busca en MyInstants. Se aplica al guardar. Déjala vacía para no cambiarla.`,
        kind: 'secret',
      },
    ],
  },
  {
    id: 'overlays',
    title: $localize`Overlays`,
    description: $localize`Clave de solo lectura que va en las URLs de los overlays (?key=).`,
    fields: [
      {
        key: 'overlayKey',
        label: $localize`Clave de overlays`,
        help: $localize`Al cambiarla, las URLs anteriores dejan de funcionar al instante y debes pegar las nuevas en LIVE Studio/OBS.`,
        kind: 'text',
      },
    ],
  },
  {
    id: 'server',
    title: $localize`Servidor`,
    description: $localize`Dónde escucha el servidor. Un valor incorrecto se revierte solo al reiniciar.`,
    fields: [
      {
        key: 'port',
        label: $localize`Puerto`,
        help: $localize`Puerto HTTP para el panel, los overlays y la API.`,
        kind: 'number',
      },
      {
        key: 'host',
        label: $localize`Interfaz de red`,
        help: $localize`0.0.0.0 = toda la red local; 127.0.0.1 = solo esta máquina.`,
        kind: 'text',
      },
    ],
  },
  {
    id: 'storage',
    title: $localize`Almacenamiento`,
    description: $localize`Rutas en disco, relativas a la carpeta del proyecto o absolutas.`,
    fields: [
      {
        key: 'dbPath',
        label: $localize`Base de datos`,
        help: $localize`Archivo SQLite con eventos, reglas y rankings.`,
        kind: 'text',
      },
      {
        key: 'assetsDir',
        label: $localize`Carpeta de assets`,
        help: $localize`Sonidos e imágenes subidos.`,
        kind: 'text',
      },
      {
        key: 'overlaysDir',
        label: $localize`Carpeta de overlays compilados`,
        help: $localize`Normalmente no hace falta cambiarla.`,
        kind: 'text',
      },
    ],
  },
  {
    id: 'logging',
    title: $localize`Registro`,
    description: $localize`Cuánto detalle escribe el servidor en su log.`,
    fields: [
      {
        key: 'logLevel',
        label: $localize`Nivel de log`,
        help: $localize`Se aplica al instante.`,
        kind: 'select',
        options: LOG_LEVELS.map((l) => ({ value: l, label: LOG_LABELS[l] })),
      },
    ],
  },
];

export const APPLY_LABELS: Readonly<Record<ApplyMode, string>> = {
  live: $localize`Se aplica al instante`,
  reconnect: $localize`Reconecta con TikTok`,
  restart: $localize`Requiere reinicio`,
};

export function sourceLabel(source: SettingSource, env: string): string {
  if (source === 'ui') return $localize`Guardado en el panel`;
  if (source === 'env') return $localize`Variable de entorno ${env}`;
  return $localize`Valor por defecto`;
}
