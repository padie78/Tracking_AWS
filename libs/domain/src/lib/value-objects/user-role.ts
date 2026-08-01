import { InvalidUserRoleError } from '../errors/domain-errors';

export type UserRoleValue = 'finops_admin' | 'analyst' | 'viewer';

const ROLES: ReadonlySet<string> = new Set([
  'finops_admin',
  'analyst',
  'viewer',
]);

export class UserRole {
  private constructor(public readonly value: UserRoleValue) {}

  static from(raw: string): UserRole {
    const normalized = raw.toLowerCase();
    if (!ROLES.has(normalized)) {
      throw new InvalidUserRoleError(raw);
    }
    return new UserRole(normalized as UserRoleValue);
  }

  static all(): readonly UserRoleValue[] {
    return ['finops_admin', 'analyst', 'viewer'];
  }

  canManageConnections(): boolean {
    return this.value === 'finops_admin';
  }

  canRunScans(): boolean {
    return this.value === 'finops_admin' || this.value === 'analyst';
  }

  toString(): string {
    return this.value;
  }
}
