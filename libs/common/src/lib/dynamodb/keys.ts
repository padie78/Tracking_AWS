/**
 * Single-Table Design — Track_AWS (multi-tenant Audit / FinOps / SecOps).
 *
 * Patrones:
 *   TENANT#<id> + PROFILE | ACCOUNT# | SCAN# | AUDIT# | DOSSIER# | REPORT# | SUBSCRIPTION
 *   TENANT#<id>#AUDIT#<auditId> + FINDING#<domain>#<findingId>
 *   TENANT#<id>#SCAN#<scanId>   + FINDING#<category>#<findingId>  (legacy FinOps)
 */

export const KeyPrefix = {
  Tenant: 'TENANT#',
  Account: 'ACCOUNT#',
  Scan: 'SCAN#',
  Audit: 'AUDIT#',
  Finding: 'FINDING#',
  Category: 'CATEGORY#',
  Dossier: 'DOSSIER#',
  Report: 'REPORT#',
  Profile: 'PROFILE',
  Subscription: 'SUBSCRIPTION',
  Alert: 'ALERT#',
  Resource: 'RESOURCE#',
} as const;

export type FindingCategoryKey =
  | 'rightsizing'
  | 'modernization'
  | 'orphaned'
  | 'finops'
  | 'secops'
  | 'architecture';

export const DynamoKeys = {
  tenantPk(tenantId: string): string {
    return `${KeyPrefix.Tenant}${tenantId}`;
  },

  profileSk(): string {
    return KeyPrefix.Profile;
  },

  memberSk(userId: string): string {
    return `MEMBER#${userId}`;
  },

  memberSkPrefix(): string {
    return 'MEMBER#';
  },

  accountSk(accountId: string): string {
    return `${KeyPrefix.Account}${accountId}`;
  },

  accountSkPrefix(): string {
    return KeyPrefix.Account;
  },

  scanSk(scanId: string): string {
    return `${KeyPrefix.Scan}${scanId}`;
  },

  scanSkPrefix(): string {
    return KeyPrefix.Scan;
  },

  auditSk(auditId: string): string {
    return `${KeyPrefix.Audit}${auditId}`;
  },

  auditSkPrefix(): string {
    return KeyPrefix.Audit;
  },

  scanFindingsPk(tenantId: string, scanId: string): string {
    return `${KeyPrefix.Tenant}${tenantId}#${KeyPrefix.Scan}${scanId}`;
  },

  auditFindingsPk(tenantId: string, auditId: string): string {
    return `${KeyPrefix.Tenant}${tenantId}#${KeyPrefix.Audit}${auditId}`;
  },

  findingSk(category: string, findingId: string): string {
    return `${KeyPrefix.Finding}${category}#${findingId}`;
  },

  findingSkPrefix(category?: string): string {
    return category ? `${KeyPrefix.Finding}${category}#` : KeyPrefix.Finding;
  },

  dossierSk(dossierId: string): string {
    return `${KeyPrefix.Dossier}${dossierId}`;
  },

  reportSk(reportId: string): string {
    return `${KeyPrefix.Report}${reportId}`;
  },

  subscriptionSk(): string {
    return KeyPrefix.Subscription;
  },

  alertSk(channelId: string): string {
    return `${KeyPrefix.Alert}${channelId}`;
  },

  alertSkPrefix(): string {
    return KeyPrefix.Alert;
  },

  /**
   * Inventario hot: incluye región para evitar colisiones
   * (mismo nombre Lambda/DDB/ECS en varias regiones o clusters).
   */
  resourceSk(resourceType: string, region: string, resourceId: string): string {
    const safeRegion = region.trim() || 'global';
    return `${KeyPrefix.Resource}${resourceType}#${safeRegion}#${resourceId}`;
  },

  resourceSkPrefix(resourceType?: string): string {
    return resourceType
      ? `${KeyPrefix.Resource}${resourceType}#`
      : KeyPrefix.Resource;
  },

  categoryGsi1Pk(tenantId: string, category: FindingCategoryKey): string {
    return `${KeyPrefix.Tenant}${tenantId}#${KeyPrefix.Category}${category}`;
  },

  categoryGsi1Sk(createdAtIso: string, findingId: string): string {
    return `${createdAtIso}#${findingId}`;
  },
};
