import { auditHotKeepCount } from './hot-retention';
import { DynamoDbAuditInventoryRepository } from '../repositories/dynamodb-audit-inventory.repository';
import {
  DynamoDbAuditFindingRepository,
  DynamoDbAuditJobRepository,
} from '../repositories/dynamodb-audit.repository';

/**
 * Tras un audit completed: deja findings+inventario solo en los N audits
 * más recientes. Los AUDIT_JOB (scores/counts) se conservan (TTL largo).
 * Histórico detallado → Parquet.
 */
export class AuditHotRetentionPruner {
  constructor(
    private readonly audits = new DynamoDbAuditJobRepository(),
    private readonly findings = new DynamoDbAuditFindingRepository(),
    private readonly inventory = new DynamoDbAuditInventoryRepository(),
  ) {}

  async prune(input: {
    tenantId: string;
    keepAuditId: string;
  }): Promise<{
    prunedAudits: string[];
    deletedFindings: number;
    deletedResources: number;
  }> {
    const keep = auditHotKeepCount();
    const list = await this.audits.listByTenant(input.tenantId, 50);
    const keepIds = new Set<string>([input.keepAuditId]);

    for (const audit of list) {
      if (keepIds.size >= keep) break;
      keepIds.add(audit.auditId);
    }

    const prunedAudits: string[] = [];
    let deletedFindings = 0;
    let deletedResources = 0;

    for (const audit of list) {
      if (keepIds.has(audit.auditId)) continue;
      deletedFindings += await this.findings.deleteByAudit(
        input.tenantId,
        audit.auditId,
      );
      deletedResources += await this.inventory.deleteByAudit(
        input.tenantId,
        audit.auditId,
      );
      prunedAudits.push(audit.auditId);
    }

    return { prunedAudits, deletedFindings, deletedResources };
  }
}
