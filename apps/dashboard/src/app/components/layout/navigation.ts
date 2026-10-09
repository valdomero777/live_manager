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
    label: 'General',
    items: [{ path: '/inicio', label: 'Dashboard', icon: LucideLayoutDashboard, exact: true }],
  },
  {
    label: 'LIVE',
    items: [
      { path: '/estado', label: 'Conexión y estado', icon: LucideRadio },
      { path: '/eventos', label: 'Eventos', icon: LucideActivity },
      { path: '/simulador', label: 'Simulador', icon: LucideFlaskConical },
    ],
  },
  {
    label: 'Automatizaciones',
    items: [
      { path: '/reglas', label: 'Reglas', icon: LucideWorkflow },
      { path: '/triggers', label: 'Triggers de sonido', icon: LucideZap },
    ],
  },
  {
    label: 'Contenido',
    items: [
      { path: '/assets', label: 'Sonidos e imágenes', icon: LucideMusic },
      { path: '/overlays', label: 'Overlays', icon: LucideLayers },
    ],
  },
  {
    label: 'Analítica',
    items: [{ path: '/rankings', label: 'Rankings y metas', icon: LucideTrophy }],
  },
  {
    label: 'Sistema',
    items: [{ path: '/ajustes', label: 'Ajustes', icon: LucideSettings }],
  },
];
