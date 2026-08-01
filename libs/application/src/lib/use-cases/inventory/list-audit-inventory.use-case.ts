import { z } from 'zod';
import type { IAuditInventoryReader } from '../../ports/inventory/inventory.port';
import type { AccountInventoryView } from '../../ports/inventory/inventory.port';
import type { AuditReportInventorySummary } from '../../ports/audit/audit-report.port';
import type { IAuditReportReader } from '../../ports/audit/audit-report.port';

const InputSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
});

export class ListAuditInventoryUseCase {
  constructor(
    private readonly inventory: IAuditInventoryReader,
    private readonly reports: IAuditReportReader,
  ) {}

  async execute(raw: unknown): Promise<AccountInventoryView | null> {
    const input = InputSchema.parse(raw);
    const resources = await this.inventory.listByAudit(
      input.tenantId,
      input.auditId,
    );
    const report = await this.reports.findByAuditId(
      input.tenantId,
      input.auditId,
    );

    if (resources.length === 0) {
      if (!report?.inventorySummary) return null;
      return emptyFromSummary(
        report.accountId,
        input.auditId,
        report.inventorySummary,
      );
    }

    const summary = {
      ec2Count: resources.filter((r) => r.resourceType === 'ec2').length,
      ebsCount: resources.filter((r) => r.resourceType === 'ebs').length,
      eipCount: resources.filter((r) => r.resourceType === 'eip').length,
      runningEc2Count: resources.filter(
        (r) => r.resourceType === 'ec2' && r.state === 'running',
      ).length,
      stoppedEc2Count: resources.filter(
        (r) => r.resourceType === 'ec2' && r.state === 'stopped',
      ).length,
      unattachedEbsCount: resources.filter(
        (r) => r.resourceType === 'ebs' && r.state === 'unattached',
      ).length,
      idleEipCount: resources.filter(
        (r) => r.resourceType === 'eip' && r.state === 'idle',
      ).length,
    };

    return {
      accountId: report?.accountId ?? '',
      capturedAtIso: report?.createdAtIso ?? new Date().toISOString(),
      source: 'audit',
      auditId: input.auditId,
      summary,
      resources,
    };
  }
}

function emptyFromSummary(
  accountId: string,
  auditId: string,
  summary: AuditReportInventorySummary,
): AccountInventoryView {
  return {
    accountId,
    capturedAtIso: new Date().toISOString(),
    source: 'audit',
    auditId,
    summary,
    resources: [],
  };
}
