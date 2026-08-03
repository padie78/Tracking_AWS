import type { UserRole } from '../auth/user-role';

/**
 * Menú alineado a PROYECTO_VISION — módulos 1–9.
 * Copy orientado a usuarios no técnicos (rutas/ids siguen el contrato interno).
 */
export type AppNavIcon =
  | 'dashboard'
  | 'secops'
  | 'compliance'
  | 'finops'
  | 'inventory'
  | 'twin'
  | 'copilot'
  | 'playbooks'
  | 'settings';

export interface AppSubnavItem {
  id: string;
  label: string;
  title: string;
  description: string;
  route: string;
  icon: AppNavIcon;
  /** Número de módulo producto (1–9). */
  module: number;
  exact?: boolean;
}

const ALL_MODULES: AppSubnavItem[] = [
  {
    id: 'dashboard',
    module: 1,
    label: 'Resumen',
    title: 'Resumen general',
    description: 'Salud de tu nube, alertas y tendencias',
    route: '/tabs/dashboard',
    icon: 'dashboard',
  },
  {
    id: 'secops',
    module: 2,
    label: 'Seguridad',
    title: 'Centro de seguridad',
    description: 'Riesgos detectados y avisos urgentes',
    route: '/tabs/secops',
    icon: 'secops',
  },
  {
    id: 'compliance',
    module: 3,
    label: 'Cumplimiento',
    title: 'Cumplimiento normativo',
    description: 'Normas, justificaciones y evidencias',
    route: '/tabs/compliance',
    icon: 'compliance',
  },
  {
    id: 'finops',
    module: 4,
    label: 'Costos',
    title: 'Control de gastos',
    description: 'Gastos, ahorros y avisos de presupuesto',
    route: '/tabs/finops',
    icon: 'finops',
  },
  {
    id: 'inventory',
    module: 5,
    label: 'Inventario',
    title: 'Inventario y mapa',
    description: 'Recursos y cómo se conectan entre sí',
    route: '/tabs/inventory',
    icon: 'inventory',
  },
  {
    id: 'twin',
    module: 6,
    label: 'Riesgos',
    title: 'Simulador de riesgos',
    description: 'Qué pasaría ante un ataque probable',
    route: '/tabs/twin',
    icon: 'twin',
  },
  {
    id: 'copilot',
    module: 7,
    label: 'Asistente',
    title: 'Asistente virtual',
    description: 'Preguntá y recibí pasos concretos',
    route: '/tabs/copilot',
    icon: 'copilot',
  },
  {
    id: 'playbooks',
    module: 8,
    label: 'Acciones',
    title: 'Acciones automáticas',
    description: 'Arreglos en un clic y reportes de ahorro',
    route: '/tabs/playbooks',
    icon: 'playbooks',
  },
  {
    id: 'settings',
    module: 9,
    label: 'Ajustes',
    title: 'Ajustes de la cuenta',
    description: 'Cuentas AWS, avisos y permisos del equipo',
    route: '/tabs/settings',
    icon: 'settings',
  },
];

/** OWNER / ADMIN (Cognito finops_admin). */
const ADMIN_SUBNAV_ITEMS: AppSubnavItem[] = ALL_MODULES;

/** DEVELOPER (Cognito analyst): sin gobernanza SaaS completa. */
const ANALYST_SUBNAV_ITEMS: AppSubnavItem[] = ALL_MODULES.filter(
  (item) => item.id !== 'settings',
);

/** AUDITOR (Cognito viewer): lectura · vista simple. */
const VIEWER_SUBNAV_ITEMS: AppSubnavItem[] = ALL_MODULES.filter((item) =>
  ['dashboard', 'secops', 'compliance', 'inventory', 'playbooks'].includes(
    item.id,
  ),
);

export function navItemsForRole(role: UserRole): AppSubnavItem[] {
  if (role === 'finops_admin') return ADMIN_SUBNAV_ITEMS;
  if (role === 'analyst') return ANALYST_SUBNAV_ITEMS;
  return VIEWER_SUBNAV_ITEMS;
}

export function navFocusForRole(role: UserRole): string {
  if (role === 'finops_admin') return 'Menú principal';
  if (role === 'analyst') return 'Menú de análisis';
  return 'Menú de consulta';
}

/** PrimeIcons por módulo. */
export const NAV_ICON_CLASS: Record<AppNavIcon, string> = {
  dashboard: 'pi pi-chart-pie',
  secops: 'pi pi-shield',
  compliance: 'pi pi-verified',
  finops: 'pi pi-wallet',
  inventory: 'pi pi-sitemap',
  twin: 'pi pi-bolt',
  copilot: 'pi pi-comments',
  playbooks: 'pi pi-play',
  settings: 'pi pi-cog',
};
