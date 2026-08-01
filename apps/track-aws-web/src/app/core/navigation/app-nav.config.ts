import type { UserRole } from '../auth/user-role';

export type AppNavIcon =
  | 'dashboard'
  | 'audits'
  | 'inventory'
  | 'finops'
  | 'secops'
  | 'architecture'
  | 'reports'
  | 'settings';

export interface AppSubnavItem {
  id: string;
  label: string;
  title: string;
  description: string;
  route: string;
  icon: AppNavIcon;
  exact?: boolean;
}

const ADMIN_SUBNAV_ITEMS: AppSubnavItem[] = [
  {
    id: 'dashboard',
    label: 'Inicio',
    title: 'Dashboard',
    description: 'Score WAF, ahorro USD y último audit',
    route: '/tabs/dashboard',
    icon: 'dashboard',
  },
  {
    id: 'audits',
    label: 'Audits',
    title: 'Historial de audits',
    description: 'Estado, scores y findings por ejecución',
    route: '/tabs/audits',
    icon: 'audits',
  },
  {
    id: 'inventory',
    label: 'Inventario',
    title: 'Inventario AWS',
    description: 'EC2, EBS y Elastic IP de la cuenta',
    route: '/tabs/inventory',
    icon: 'inventory',
  },
  {
    id: 'finops',
    label: 'FinOps',
    title: 'FinOps',
    description: 'Right-sizing, modernización y recursos huérfanos',
    route: '/tabs/finops',
    icon: 'finops',
  },
  {
    id: 'secops',
    label: 'SecOps',
    title: 'SecOps (Prowler)',
    description: 'Findings CIS / compliance',
    route: '/tabs/secops',
    icon: 'secops',
  },
  {
    id: 'architecture',
    label: 'Arquitectura',
    title: 'Well-Architected',
    description: 'Pilares WAF y consistencia',
    route: '/tabs/architecture',
    icon: 'architecture',
  },
  {
    id: 'reports',
    label: 'Informe',
    title: 'Informe de auditoría',
    description: 'Inventario, riesgos, ahorro y reporte IA',
    route: '/tabs/reports',
    icon: 'reports',
  },
  {
    id: 'settings',
    label: 'Settings',
    title: 'Settings',
    description: 'Cuenta AWS + canales de alerta',
    route: '/tabs/settings',
    icon: 'settings',
  },
];

const ANALYST_SUBNAV_ITEMS: AppSubnavItem[] = ADMIN_SUBNAV_ITEMS.filter(
  (item) => item.id !== 'settings',
);

const VIEWER_SUBNAV_ITEMS: AppSubnavItem[] = ADMIN_SUBNAV_ITEMS.filter(
  (item) =>
    item.id === 'dashboard' ||
    item.id === 'audits' ||
    item.id === 'inventory' ||
    item.id === 'reports',
);

export function navItemsForRole(role: UserRole): AppSubnavItem[] {
  if (role === 'finops_admin') return ADMIN_SUBNAV_ITEMS;
  if (role === 'analyst') return ANALYST_SUBNAV_ITEMS;
  return VIEWER_SUBNAV_ITEMS;
}

export function navFocusForRole(role: UserRole): string {
  if (role === 'finops_admin') return 'Gobernanza';
  if (role === 'analyst') return 'Análisis';
  return 'Lectura';
}

export const NAV_ICON_GLYPH: Record<AppNavIcon, string> = {
  dashboard: '◈',
  audits: '☰',
  inventory: '▦',
  finops: '$',
  secops: '⬡',
  architecture: '⬢',
  reports: '▤',
  settings: '⚙',
};
