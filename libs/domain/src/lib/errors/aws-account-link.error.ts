import { DomainError } from './domain-errors';

export class AwsAccountLinkNotFoundError extends DomainError {
  constructor(tenantId: string, accountId: string) {
    super(`Cuenta AWS no vinculada: tenant=${tenantId} account=${accountId}`);
  }
}

export class AwsAssumeRoleError extends DomainError {
  constructor(detail: string) {
    super(`AssumeRole falló: ${detail}`);
  }
}
