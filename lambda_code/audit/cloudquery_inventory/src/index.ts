import type { Handler } from 'aws-lambda';
import type { AuditPayload } from '@track-aws/domain';
import {
  AssumeRoleAwsInventoryAdapter,
  CloudQueryInventoryEngine,
} from '@track-aws/infrastructure';

export const handler: Handler<AuditPayload> = async (event) => {
  const engine = new CloudQueryInventoryEngine(new AssumeRoleAwsInventoryAdapter());
  const result = await engine.run(event);

  return {
    inventorySummary: result.inventorySummary,
    findings: result.auditFindings.map((f) => ({
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
    })),
  };
};
