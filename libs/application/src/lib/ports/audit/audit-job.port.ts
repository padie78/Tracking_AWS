import type { AuditJob } from '@track-aws/domain';

export interface IAuditJobWriter {
  save(audit: AuditJob): Promise<void>;
}

export interface IAuditJobReader {
  findById(tenantId: string, auditId: string): Promise<AuditJob | null>;
  listByTenant(tenantId: string, limit?: number): Promise<AuditJob[]>;
}
