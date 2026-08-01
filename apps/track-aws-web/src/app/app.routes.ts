import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/auth/login.page').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/auth/register.page').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./pages/auth/auth-callback.page').then((m) => m.AuthCallbackPageComponent),
  },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/shell/shell.page').then((m) => m.ShellPageComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPageComponent),
      },
      {
        path: 'audits',
        loadComponent: () =>
          import('./pages/audits/audits.page').then((m) => m.AuditsPageComponent),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./pages/inventory/inventory.page').then(
            (m) => m.InventoryPageComponent,
          ),
      },
      {
        path: 'finops',
        loadComponent: () =>
          import('./pages/finops/finops.page').then((m) => m.FinopsPageComponent),
      },
      {
        path: 'secops',
        loadComponent: () =>
          import('./pages/secops/secops.page').then((m) => m.SecopsPageComponent),
      },
      {
        path: 'architecture',
        loadComponent: () =>
          import('./pages/architecture/architecture.page').then(
            (m) => m.ArchitecturePageComponent,
          ),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./pages/reports/reports.page').then((m) => m.ReportsPageComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.page').then((m) => m.SettingsPageComponent),
      },
      // Compat rutas legacy
      { path: 'rightsizing', redirectTo: 'finops', pathMatch: 'full' },
      { path: 'modernization', redirectTo: 'finops', pathMatch: 'full' },
      { path: 'orphaned', redirectTo: 'finops', pathMatch: 'full' },
      { path: 'dossier', redirectTo: 'reports', pathMatch: 'full' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'tabs/dashboard' },
  { path: '**', redirectTo: 'tabs/dashboard' },
];
