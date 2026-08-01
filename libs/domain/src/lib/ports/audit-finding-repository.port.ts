import type { AuditFinding } from '../entities/audit-finding';

export interface IAuditFindingRepository {
  saveMany(findings: AuditFinding[]): Promise<void>;
  listByAudit(tenantId: string, auditId: string): Promise<AuditFinding[]>;
}
