import {
  LucideActivity,
  LucideFlaskConical,
  LucideLayers,
  LucideLayoutDashboard,
  LucideMusic,
  LucideRadio,
  LucideSettings,
  LucideTrophy,
  LucideWorkflow,
  LucideZap,
  type LucideIcon,
} from '@lucide/angular';

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Also active on child routes (/reglas/12). */
  readonly exact?: boolean;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

/**
 * Navigation built around what the product does: watch the LIVE, automate reactions, manage
 * content, read results. Only sections that exist are listed.
 */
export const NAVIGATION: readonly NavGroup[] = [
  {
    label: $localize`General`,
    items: [
      { path: '/inicio', label: $localize`Dashboard`, icon: LucideLayoutDashboard, exact: true },
    ],
  },
  {
    label: 'LIVE',
    items: [
      { path: '/estado', label: $localize`Conexión y estado`, icon: LucideRadio },
      { path: '/eventos', label: $localize`Eventos`, icon: LucideActivity },
      { path: '/simulador', label: $localize`Simulador`, icon: LucideFlaskConical },
    ],
  },
  {
    label: $localize`Automatizaciones`,
    items: [
      { path: '/reglas', label: $localize`Reglas`, icon: LucideWorkflow },
      { path: '/triggers', label: $localize`Triggers de sonido`, icon: LucideZap },
    ],
  },
  {
    label: $localize`Contenido`,
    items: [
      { path: '/assets', label: $localize`Sonidos e imágenes`, icon: LucideMusic },
      { path: '/overlays', label: $localize`Overlays`, icon: LucideLayers },
    ],
  },
  {
    label: $localize`Analítica`,
    items: [{ path: '/rankings', label: $localize`Rankings y metas`, icon: LucideTrophy }],
  },
  {
    label: $localize`Sistema`,
    items: [{ path: '/ajustes', label: $localize`Ajustes`, icon: LucideSettings }],
  },
];
