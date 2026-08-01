import { z } from 'zod';
import type { IAuditFindingReader } from '../../ports/audit/audit-finding.port';

const schema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  domain: z.enum(['finops', 'secops', 'architecture']).optional(),
});

export class ListAuditFindingsUseCase {
  constructor(private readonly findings: IAuditFindingReader) {}

  async execute(raw: unknown) {
    const input = schema.parse(raw);
    const list = await this.findings.listByAudit(input.tenantId, input.auditId);
    return list
      .filter((f) => !input.domain || f.domain === input.domain)
      .map((f) => ({
        tenantId: f.tenantId,
        auditId: f.auditId,
        findingId: f.findingId,
        domain: f.domain,
        category: f.category,
        severity: f.severity,
        resourceArn: f.resourceArn,
        resourceId: f.resourceId,
        region: f.region,
        title: f.title,
        rationale: f.rationale,
        recommendedAction: f.recommendedAction,
        estimatedMonthlySavingsUsd: f.estimatedMonthlySavingsUsd,
        checkId: f.checkId,
        createdAtIso: f.createdAtIso,
      }));
  }
}
