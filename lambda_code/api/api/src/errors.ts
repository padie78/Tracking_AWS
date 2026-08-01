import { ZodError } from 'zod';
import {
  AwsAccountLinkNotFoundError,
  AwsAssumeRoleError,
  McpConnectionError,
} from '@track-aws/domain';

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
