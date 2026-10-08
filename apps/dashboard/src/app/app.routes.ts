import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · TikLive',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'estado' },
      {
        path: 'estado',
        title: 'Estado · TikLive',
        loadComponent: () => import('./features/status/status.page').then((m) => m.StatusPage),
      },
      {
        path: 'eventos',
        title: 'Eventos · TikLive',
        loadComponent: () => import('./features/events/events.page').then((m) => m.EventsPage),
      },
      {
        path: 'reglas',
        title: 'Reglas · TikLive',
        loadComponent: () => import('./features/rules/rule-list.page').then((m) => m.RuleListPage),
      },
      {
        path: 'reglas/nueva',
        title: 'Nueva regla · TikLive',
        loadComponent: () =>
          import('./features/rules/rule-editor.page').then((m) => m.RuleEditorPage),
      },
      {
        path: 'reglas/:id',
        title: 'Editar regla · TikLive',
        loadComponent: () =>
          import('./features/rules/rule-editor.page').then((m) => m.RuleEditorPage),
      },
      {
        path: 'triggers',
        title: 'Triggers de sonido · TikLive',
        loadComponent: () =>
          import('./features/triggers/triggers.page').then((m) => m.TriggersPage),
      },
      {
        path: 'rankings',
        title: 'Rankings y metas · TikLive',
        loadComponent: () =>
          import('./features/rankings/rankings.page').then((m) => m.RankingsPage),
      },
      {
        path: 'assets',
        title: 'Sonidos e imágenes · TikLive',
        loadComponent: () => import('./features/assets/assets.page').then((m) => m.AssetsPage),
      },
      {
        path: 'overlays',
        title: 'Overlays · TikLive',
        loadComponent: () =>
          import('./features/overlays/overlays.page').then((m) => m.OverlaysPage),
      },
      {
        path: 'simulador',
        title: 'Simulador · TikLive',
        loadComponent: () =>
          import('./features/simulator/simulator.page').then((m) => m.SimulatorPage),
      },
      {
        path: 'ajustes',
        title: 'Ajustes · TikLive',
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
