import { ZodError } from 'zod';
import {
  AwsAccountLinkNotFoundError,
  AwsAssumeRoleError,
  McpConnectionError,
  UserRole,
  type UserRoleValue,
} from '@track-aws/domain';
import { DynamoDbTenantMembershipRepository } from '@track-aws/infrastructure';

export type AppSyncErrorType =
  | 'ValidationError'
  | 'Forbidden'
  | 'McpConnectionError'
  | 'AssumeRoleError'
  | 'NotFound';

export class AppSyncTypedError extends Error {
  constructor(
    public readonly errorType: AppSyncErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'AppSyncTypedError';
  }
}

export function rethrowAsTyped(err: unknown): never {
  if (err instanceof ZodError) {
    const typed = new AppSyncTypedError('ValidationError', err.message);
    typed.name = 'ValidationError';
    throw typed;
  }
  if (err instanceof AwsAccountLinkNotFoundError) {
    const typed = new AppSyncTypedError('NotFound', err.message);
    typed.name = 'NotFound';
    throw typed;
  }
  if (err instanceof AwsAssumeRoleError) {
    const typed = new AppSyncTypedError('AssumeRoleError', err.message);
    typed.name = 'AssumeRoleError';
    throw typed;
  }
  if (err instanceof McpConnectionError) {
    const typed = new AppSyncTypedError('McpConnectionError', err.message);
    typed.name = 'McpConnectionError';
    throw typed;
  }
  throw err;
}

/**
 * Multitenant: tenant_id SOLO desde JWT Cognito.
 * Nunca aceptar tenantId del cliente (args GraphQL / body).
 */
export function requireTenantId(
  identity: { claims?: Record<string, unknown> } | null | undefined,
): string {
  const fromClaim = identity?.claims?.['custom:tenant_id'];
  const tenantId =
    typeof fromClaim === 'string' ? fromClaim.trim() : '';

  if (!tenantId) {
    throw new AppSyncTypedError(
      'Forbidden',
      'tenant_id requerido en el token Cognito (custom:tenant_id).',
    );
  }
  return tenantId;
}

export function requireUserId(
  identity:
    | { claims?: Record<string, unknown>; sub?: string }
    | null
    | undefined,
): string {
  const fromSub = identity?.sub;
  const fromClaim = identity?.claims?.['sub'];
  const userId =
    (typeof fromSub === 'string' && fromSub.trim()) ||
    (typeof fromClaim === 'string' && fromClaim.trim()) ||
    '';
  if (!userId) {
    throw new AppSyncTypedError('Forbidden', 'Usuario Cognito (sub) requerido.');
  }
  return userId;
}

export type AuthorizedContext = {
  tenantId: string;
  userId: string;
  role: UserRole;
  email: string;
};

/**
 * Validación de membresía + rol desde Dynamo (SoT).
 * Cognito solo autentica; RBAC sale de MEMBER#.
 */
export async function requireMembership(
  identity:
    | { claims?: Record<string, unknown>; sub?: string }
    | null
    | undefined,
): Promise<AuthorizedContext> {
  const tenantId = requireTenantId(identity);
  const userId = requireUserId(identity);
  const repo = new DynamoDbTenantMembershipRepository();
  const member = await repo.findByUser(tenantId, userId);

  if (!member) {
    const claimRoleRaw = String(
      identity?.claims?.['custom:user_role'] ?? 'viewer',
    ).toLowerCase();
    const claimRole: UserRoleValue =
      claimRoleRaw === 'finops_admin' ||
      claimRoleRaw === 'analyst' ||
      claimRoleRaw === 'viewer'
        ? claimRoleRaw
        : 'viewer';
    const email = String(identity?.claims?.['email'] ?? '');
    const now = new Date().toISOString();
    const role = UserRole.from(claimRole);
    await repo.save({
      tenantId,
      userId,
      email,
      role: role.value,
      createdAtIso: now,
      updatedAtIso: now,
    });
    await repo.saveIfAbsent({
      tenantId,
      name: tenantId,
      plan: 'starter',
      createdAtIso: now,
      updatedAtIso: now,
    });
    return { tenantId, userId, role, email };
  }

  return {
    tenantId,
    userId,
    role: UserRole.from(member.role),
    email: member.email,
  };
}

export function requireCanManageConnections(ctx: AuthorizedContext): void {
  if (!ctx.role.canManageConnections()) {
    throw new AppSyncTypedError(
      'Forbidden',
      'Se requiere rol finops_admin para gestionar conexiones AWS / alertas.',
    );
  }
}

export function requireCanRunScans(ctx: AuthorizedContext): void {
  if (!ctx.role.canRunScans()) {
    throw new AppSyncTypedError(
      'Forbidden',
      'Se requiere rol finops_admin o analyst para ejecutar audits/scans.',
    );
  }
}
