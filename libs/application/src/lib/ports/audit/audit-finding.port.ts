import type { AuditFinding } from '@track-aws/domain';

export interface IAuditFindingWriter {
  saveMany(findings: AuditFinding[]): Promise<void>;
  /** Borra findings hot de un audit (histórico → Parquet). */
  deleteByAudit(tenantId: string, auditId: string): Promise<number>;
}

export interface IAuditFindingReader {
  listByAudit(tenantId: string, auditId: string): Promise<AuditFinding[]>;
}
