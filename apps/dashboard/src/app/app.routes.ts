import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: $localize`Iniciar sesión · TikLive`,
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./components/layout/app-shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: $localize`Dashboard · TikLive`,
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'estado',
        title: $localize`Conexión y estado · TikLive`,
        loadComponent: () => import('./features/status/status.page').then((m) => m.StatusPage),
      },
      {
        path: 'eventos',
        title: $localize`Eventos · TikLive`,
        loadComponent: () => import('./features/events/events.page').then((m) => m.EventsPage),
      },
      {
        path: 'reglas',
        title: $localize`Reglas · TikLive`,
        loadComponent: () => import('./features/rules/rule-list.page').then((m) => m.RuleListPage),
      },
      {
        path: 'reglas/nueva',
        title: $localize`Nueva regla · TikLive`,
        loadComponent: () =>
          import('./features/rules/rule-editor.page').then((m) => m.RuleEditorPage),
      },
      {
        path: 'reglas/:id',
        title: $localize`Editar regla · TikLive`,
        loadComponent: () =>
          import('./features/rules/rule-editor.page').then((m) => m.RuleEditorPage),
      },
      {
        path: 'triggers',
        title: $localize`Triggers de sonido · TikLive`,
        loadComponent: () =>
          import('./features/triggers/triggers.page').then((m) => m.TriggersPage),
      },
      {
        path: 'rankings',
        title: $localize`Rankings y metas · TikLive`,
        loadComponent: () =>
          import('./features/rankings/rankings.page').then((m) => m.RankingsPage),
      },
      {
        path: 'assets',
        title: $localize`Sonidos e imágenes · TikLive`,
        loadComponent: () => import('./features/assets/assets.page').then((m) => m.AssetsPage),
      },
      {
        path: 'overlays',
        title: $localize`Overlays · TikLive`,
        loadComponent: () =>
          import('./features/overlays/overlays.page').then((m) => m.OverlaysPage),
      },
      {
        path: 'simulador',
        title: $localize`Simulador · TikLive`,
        loadComponent: () =>
          import('./features/simulator/simulator.page').then((m) => m.SimulatorPage),
      },
      {
        path: 'ajustes',
        title: $localize`Ajustes · TikLive`,
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
