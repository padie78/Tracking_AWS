import type { AuditJob } from '../entities/audit-job';

export interface IAuditJobRepository {
  save(audit: AuditJob): Promise<void>;
  findById(tenantId: string, auditId: string): Promise<AuditJob | null>;
  listByTenant(tenantId: string, limit?: number): Promise<AuditJob[]>;
}
