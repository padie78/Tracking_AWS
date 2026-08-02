import type { IAuditJobReader } from '../../ports/audit/audit-job.port';
import { z } from 'zod';

const schema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export class GetAuditUseCase {
  constructor(private readonly audits: IAuditJobReader) {}

  async execute(raw: unknown) {
    const input = schema.parse(raw);
    if (input.auditId) {
      const audit = await this.audits.findById(input.tenantId, input.auditId);
      return audit ? [toView(audit)] : [];
    }
    const list = await this.audits.listByTenant(input.tenantId, input.limit ?? 20);
    // SK = AUDIT#<uuid> no ordena por tiempo; ordenamos por createdAtIso desc.
    return list
      .map(toView)
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  }
}

function toView(audit: {
  tenantId: string;
  auditId: string;
  accountId: string;
  status: string;
  correlationId: string;
  createdAtIso: string;
  completedAtIso: string | null;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  estimatedMonthlySavingsUsd: number;
  globalScore: number;
  pillarScores: Record<string, number>;
  executionArn: string | null;
  errorMessage: string | null;
}) {
  return {
    tenantId: audit.tenantId,
    auditId: audit.auditId,
    accountId: audit.accountId,
    status: audit.status,
    correlationId: audit.correlationId,
    createdAtIso: audit.createdAtIso,
    completedAtIso: audit.completedAtIso,
    findingCount: audit.findingCount,
    criticalCount: audit.criticalCount,
    highCount: audit.highCount,
    estimatedMonthlySavingsUsd: audit.estimatedMonthlySavingsUsd,
    globalScore: audit.globalScore,
    pillarScores: audit.pillarScores,
    executionArn: audit.executionArn,
    errorMessage: audit.errorMessage,
  };
}
