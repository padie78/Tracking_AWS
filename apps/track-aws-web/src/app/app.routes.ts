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

      // M1 — Cuadro de mando
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPageComponent),
      },

      // M2 — Centro de seguridad
      {
        path: 'secops',
        loadComponent: () =>
          import('./pages/secops/secops.page').then((m) => m.SecopsPageComponent),
      },

      // M3 — Compliance Hub
      {
        path: 'compliance',
        loadComponent: () =>
          import('./pages/shared/module-placeholder.page').then(
            (m) => m.ModulePlaceholderPageComponent,
          ),
        data: {
          module: 3,
          title: 'Cumplimiento normativo',
          subtitle:
            'Revisá cómo estás frente a normas como ISO, SOC 2 y PCI, con textos claros y evidencias descargables.',
          roadmap: [
            'Mapa simple: cada control → norma que cubre',
            'Explicaciones automáticas listas para auditoría',
            'Descarga de evidencias protegidas contra cambios',
          ],
        },
      },

      // M4 — FinOps
      {
        path: 'finops',
        loadComponent: () =>
          import('./pages/finops/finops.page').then((m) => m.FinopsPageComponent),
      },

      // M5 — Inventario + topología
      {
        path: 'inventory',
        loadComponent: () =>
          import('./pages/inventory/inventory.page').then(
            (m) => m.InventoryPageComponent,
          ),
      },

      // M6 — Cyber Risk Twin
      {
        path: 'twin',
        loadComponent: () =>
          import('./pages/shared/module-placeholder.page').then(
            (m) => m.ModulePlaceholderPageComponent,
          ),
        data: {
          module: 6,
          title: 'Simulador de riesgos',
          subtitle:
            'Probá escenarios: qué caminos usaría un atacante en tu nube y en el código.',
          roadmap: [
            'Une hallazgos de nube y de aplicaciones',
            'Muestra el impacto posible en el mapa de recursos',
            'Sugiere acciones concretas para reducir el riesgo',
          ],
        },
      },

      // M7 — Copilot
      {
        path: 'copilot',
        loadComponent: () =>
          import('./pages/shared/module-placeholder.page').then(
            (m) => m.ModulePlaceholderPageComponent,
          ),
        data: {
          module: 7,
          title: 'Asistente virtual',
          subtitle:
            'Preguntá en español sobre tu última revisión y recibí respuestas con pasos a seguir.',
          roadmap: [
            'Responde con datos de tu cuenta activa',
            'Cita recursos y problemas reales (sin inventar)',
            'Te lleva a la acción recomendada en un clic',
          ],
        },
      },

      // M8 — Playbooks + ROI
      {
        path: 'playbooks',
        loadComponent: () =>
          import('./pages/shared/module-placeholder.page').then(
            (m) => m.ModulePlaceholderPageComponent,
          ),
        data: {
          module: 8,
          title: 'Acciones automáticas',
          subtitle:
            'Aplicá soluciones en un clic, apagá recursos fuera de horario y medí el ahorro.',
          roadmap: [
            'Botones de arreglo ya aprobados por tu equipo',
            'Apagado automático fuera del horario laboral',
            'Informe PDF con dinero ahorrado y riesgos evitados',
          ],
        },
      },

      // M9 — Settings / gobernanza SaaS
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.page').then((m) => m.SettingsPageComponent),
      },

      // Utilidad operativa (no es módulo de producto; accesible por deep-link)
      {
        path: 'audits',
        loadComponent: () =>
          import('./pages/audits/audits.page').then((m) => m.AuditsPageComponent),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./pages/reports/reports.page').then((m) => m.ReportsPageComponent),
      },

      // Compat rutas legacy → módulos norte
      { path: 'architecture', redirectTo: 'compliance', pathMatch: 'full' },
      { path: 'rightsizing', redirectTo: 'finops', pathMatch: 'full' },
      { path: 'modernization', redirectTo: 'finops', pathMatch: 'full' },
      { path: 'orphaned', redirectTo: 'finops', pathMatch: 'full' },
      { path: 'dossier', redirectTo: 'playbooks', pathMatch: 'full' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'tabs/dashboard' },
  { path: '**', redirectTo: 'tabs/dashboard' },
];
