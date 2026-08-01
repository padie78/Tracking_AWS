import type { Finding } from '@track-aws/domain';
import type { FindingDto } from '../dto/findings/finding.dto';

export const FindingMapper = {
  toDto(finding: Finding): FindingDto {
    return {
      tenantId: finding.tenantId,
      scanId: finding.scanId,
      findingId: finding.findingId,
      category: finding.category,
      resourceArn: finding.resourceArn,
      resourceId: finding.resourceId,
      region: finding.region,
      title: finding.title,
      rationale: finding.rationale,
      severity: finding.severity,
      estimatedMonthlySavingsUsd: finding.estimatedMonthlySavings.amount,
      recommendedAction: finding.recommendedAction,
      createdAtIso: finding.createdAtIso,
    };
  },
};
