/**
 * Identificadores discriminantes para cada tipo de ítem en la single-table.
 */
export const EntityType = {
  Tenant: 'TENANT',
  AwsAccountLink: 'AWS_ACCOUNT_LINK',
  ScanJob: 'SCAN_JOB',
  AuditJob: 'AUDIT_JOB',
  Finding: 'FINDING',
  AuditFinding: 'AUDIT_FINDING',
  SavingsDossier: 'SAVINGS_DOSSIER',
  AuditReport: 'AUDIT_REPORT',
  Subscription: 'SUBSCRIPTION',
} as const;

export type EntityTypeName = (typeof EntityType)[keyof typeof EntityType];
