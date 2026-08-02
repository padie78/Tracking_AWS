/**
 * Identificadores discriminantes para cada tipo de ítem en la single-table.
 */
export const EntityType = {
  Tenant: 'TENANT',
  TenantProfile: 'TENANT_PROFILE',
  TenantMember: 'TENANT_MEMBER',
  AwsAccountLink: 'AWS_ACCOUNT_LINK',
  ScanJob: 'SCAN_JOB',
  AuditJob: 'AUDIT_JOB',
  Finding: 'FINDING',
  AuditFinding: 'AUDIT_FINDING',
  SavingsDossier: 'SAVINGS_DOSSIER',
  AuditReport: 'AUDIT_REPORT',
  InventoryResource: 'INVENTORY_RESOURCE',
  Subscription: 'SUBSCRIPTION',
} as const;

export type EntityTypeName = (typeof EntityType)[keyof typeof EntityType];
