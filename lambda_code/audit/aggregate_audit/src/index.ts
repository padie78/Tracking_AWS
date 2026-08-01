import type { Handler } from 'aws-lambda';
import {
  AuditFinding,
  type FindingDomain,
  type AuditSeverity,
  type WafPillarScores,
} from '@track-aws/domain';
import {
  AppSyncAuditEventPublisherAdapter,
  AuditReportGenerator,
  CustomerAuditDigestPublisher,
  DynamoDbAuditFindingRepository,
  DynamoDbAuditJobRepository,
} from '@track-aws/infrastructure';

type SerializedFinding = {
  findingId: string;
  domain: FindingDomain;
  category: string;
  severity: AuditSeverity;
  resourceArn: string;
  resourceId: string;
  region: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  estimatedMonthlySavingsUsd: number;
  checkId: string | null;
  createdAtIso: string;
};

type Input = {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
  finops: { findings: SerializedFinding[]; inventorySummary?: unknown };
  secops: { findings: SerializedFinding[] };
};

function scoreFromFindings(
  findings: SerializedFinding[],
  domain: FindingDomain,
): number {
  const subset = findings.filter((f) => f.domain === domain);
  if (subset.length === 0) return 90;
  const weight: Record<AuditSeverity, number> = {
    CRITICAL: 25,
    HIGH: 12,
    MEDIUM: 5,
    LOW: 2,
    INFO: 0,
  };
  const penalty = subset.reduce((acc, f) => acc + (weight[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export const handler: Handler<Input> = async (event) => {
  const auditRepo = new DynamoDbAuditJobRepository();
  const findingRepo = new DynamoDbAuditFindingRepository();
  const digests = new CustomerAuditDigestPublisher();
  const reports = new AuditReportGenerator();
  const notifier = new AppSyncAuditEventPublisherAdapter();

  const audit = await auditRepo.findById(event.tenantId, event.auditId);
  if (!audit) {
    throw new Error(`Audit no encontrado: ${event.auditId}`);
  }

  const allSerialized = [
    ...(event.finops?.findings ?? []),
    ...(event.secops?.findings ?? []),
  ];

  const findings = allSerialized.map((f) =>
    AuditFinding.reconstitute({
      tenantId: event.tenantId,
      auditId: event.auditId,
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
    }),
  );

  await findingRepo.saveMany(findings);

  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const estimatedMonthlySavingsUsd = findings.reduce(
    (acc, f) => acc + f.estimatedMonthlySavingsUsd,
    0,
  );

  const securityScore = scoreFromFindings(allSerialized, 'secops');
  const costScore = scoreFromFindings(allSerialized, 'finops');

  const pillarScores: WafPillarScores = {
    operationalExcellence: Math.round((securityScore + costScore) / 2),
    security: securityScore,
    reliability: Math.max(0, securityScore - highCount),
    performanceEfficiency: costScore,
    costOptimization: costScore,
    sustainability: Math.round(costScore * 0.9),
  };

  const completed = audit.withStatus('aggregating').withAggregation({
    findingCount: findings.length,
    criticalCount,
    highCount,
    estimatedMonthlySavingsUsd:
      Math.round(estimatedMonthlySavingsUsd * 100) / 100,
    pillarScores,
  });
  await auditRepo.save(completed);

  await notifier.publishAuditStatusChanged({
    tenantId: completed.tenantId,
    auditId: completed.auditId,
    accountId: completed.accountId,
    status: completed.status,
    findingCount: completed.findingCount,
    criticalCount: completed.criticalCount,
    highCount: completed.highCount,
    globalScore: completed.globalScore,
    estimatedMonthlySavingsUsd: completed.estimatedMonthlySavingsUsd,
  });

  await digests.publish({
    tenantId: event.tenantId,
    auditId: event.auditId,
    accountId: event.accountId,
    globalScore: completed.globalScore,
    estimatedMonthlySavingsUsd: completed.estimatedMonthlySavingsUsd,
    findings: findings.map((f) => ({
      domain: f.domain,
      category: f.category,
      severity: f.severity,
      title: f.title,
      recommendedAction: f.recommendedAction,
      estimatedMonthlySavingsUsd: f.estimatedMonthlySavingsUsd,
      resourceId: f.resourceId,
    })),
  });

  const report = await reports.generate({
    audit: completed,
    findings,
  });

  return {
    auditId: completed.auditId,
    status: completed.status,
    findingCount: completed.findingCount,
    criticalCount: completed.criticalCount,
    highCount: completed.highCount,
    globalScore: completed.globalScore,
    estimatedMonthlySavingsUsd: completed.estimatedMonthlySavingsUsd,
    reportId: report.reportId,
    reportS3Key: report.s3Key,
  };
};
