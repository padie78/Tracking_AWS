export type UserRole = 'finops_admin' | 'analyst' | 'viewer';

export const USER_ROLES: readonly UserRole[] = [
  'finops_admin',
  'analyst',
  'viewer',
] as const;

export function normalizeUserRole(raw: unknown): UserRole {
  if (typeof raw !== 'string') return 'viewer';
  const value = raw.trim().toLowerCase();
  if (value === 'finops_admin' || value === 'admin') return 'finops_admin';
  if (value === 'analyst') return 'analyst';
  return 'viewer';
}

export function defaultHomeRouteForRole(_role: UserRole): string {
  return '/tabs/dashboard';
}

export function roleLabel(role: UserRole): string {
  if (role === 'finops_admin') return 'FinOps Admin';
  if (role === 'analyst') return 'Analyst';
  return 'Viewer';
}
