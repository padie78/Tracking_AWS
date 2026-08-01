import type { AuditFinding } from '@track-aws/domain';

export interface IAuditFindingWriter {
  saveMany(findings: AuditFinding[]): Promise<void>;
}

export interface IAuditFindingReader {
  listByAudit(tenantId: string, auditId: string): Promise<AuditFinding[]>;
}
