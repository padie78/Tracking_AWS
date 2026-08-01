import type { Handler } from 'aws-lambda';
import {
  DynamoDbAuditJobRepository,
  AppSyncAuditEventPublisherAdapter,
} from '@track-aws/infrastructure';

type Input = {
  tenantId: string;
  auditId: string;
  accountId?: string;
  error?: unknown;
};

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error.slice(0, 500);
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record['Cause'] === 'string') return record['Cause'].slice(0, 500);
    if (typeof record['Error'] === 'string') return record['Error'].slice(0, 500);
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return 'Audit pipeline failed';
    }
  }
  return 'Audit pipeline failed';
}

export const handler: Handler<Input> = async (event) => {
  const audits = new DynamoDbAuditJobRepository();
  const notifier = new AppSyncAuditEventPublisherAdapter();
  const existing = await audits.findById(event.tenantId, event.auditId);
  if (!existing) {
    console.warn('fail_audit: audit not found', event);
    return { ok: false };
  }

  const failed = existing.withFailure(errorMessage(event.error));
  await audits.save(failed);

  await notifier.publishAuditStatusChanged({
    tenantId: failed.tenantId,
    auditId: failed.auditId,
    accountId: failed.accountId,
    status: failed.status,
    findingCount: failed.findingCount,
    criticalCount: failed.criticalCount,
    highCount: failed.highCount,
    globalScore: failed.globalScore,
    estimatedMonthlySavingsUsd: failed.estimatedMonthlySavingsUsd,
  });

  return {
    ok: true,
    auditId: failed.auditId,
    status: failed.status,
  };
};
