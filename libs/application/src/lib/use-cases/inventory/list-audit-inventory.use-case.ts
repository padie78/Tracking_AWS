import { z } from 'zod';
import type { IAuditInventoryReader } from '../../ports/inventory/inventory.port';
import type { AccountInventoryView } from '../../ports/inventory/inventory.port';
import {
  summarizeInventoryResources,
  type InventorySummaryView,
} from '../../ports/inventory/inventory.port';
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
      const s = report.inventorySummary;
      return emptyFromSummary(report.accountId, input.auditId, {
        totalCount: s.totalCount ?? s.ec2Count + s.ebsCount + s.eipCount,
        ec2Count: s.ec2Count,
        ebsCount: s.ebsCount,
        eipCount: s.eipCount,
        runningEc2Count: s.runningEc2Count,
        stoppedEc2Count: s.stoppedEc2Count,
        unattachedEbsCount: s.unattachedEbsCount,
        idleEipCount: s.idleEipCount,
      });
    }

    return {
      accountId: report?.accountId ?? '',
      capturedAtIso: report?.createdAtIso ?? new Date().toISOString(),
      source: 'audit',
      auditId: input.auditId,
      summary: summarizeInventoryResources(resources),
      resources,
    };
  }
}

function emptyFromSummary(
  accountId: string,
  auditId: string,
  summary: InventorySummaryView,
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
