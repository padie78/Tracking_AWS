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
  ProwlerSecurityEngine,
  type InventorySummaryView,
} from '@track-aws/infrastructure';
import { randomUUID } from 'node:crypto';

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
  roleArn?: string;
  externalId?: string;
  regions?: string[];
  finops: {
    findings: SerializedFinding[];
    inventorySummary?: InventorySummaryView | null;
  };
  secops: { findings: SerializedFinding[]; warning?: string; engine?: string };
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

function architectureFindingsFromPillars(input: {
  tenantId: string;
  auditId: string;
  pillarScores: WafPillarScores;
}): SerializedFinding[] {
  const now = new Date().toISOString();
  const mapping: Array<{
    key: keyof WafPillarScores;
    category: string;
    title: string;
    action: string;
  }> = [
    {
      key: 'security',
      category: 'security',
      title: 'Brecha en pilar Security (WAF)',
      action: 'Priorizá remediación SecOps CRITICAL/HIGH y endurecé IAM/network.',
    },
    {
      key: 'costOptimization',
      category: 'cost',
      title: 'Brecha en pilar Cost Optimization (WAF)',
      action: 'Ejecutá right-sizing, apagá idle y revisá EIPs/EBS huérfanos.',
    },
    {
      key: 'reliability',
      category: 'reliability',
      title: 'Brecha en pilar Reliability (WAF)',
      action: 'Revisá multi-AZ, backups y límites de cuota en servicios críticos.',
    },
    {
      key: 'performanceEfficiency',
      category: 'performance',
      title: 'Brecha en pilar Performance Efficiency (WAF)',
      action: 'Alineá tipos de instancia y storage al workload real.',
    },
  ];

  return mapping
    .filter((m) => input.pillarScores[m.key] < 70)
    .map((m) => {
      const score = input.pillarScores[m.key];
      const severity: AuditSeverity =
        score < 40 ? 'CRITICAL' : score < 55 ? 'HIGH' : 'MEDIUM';
      return {
        findingId: randomUUID(),
        domain: 'architecture' as const,
        category: m.category,
        severity,
        resourceArn: `waf:${m.key}`,
        resourceId: m.key,
        region: 'global',
        title: m.title,
        rationale: `Score del pilar ${m.key}=${score}/100. Por debajo del umbral 70.`,
        recommendedAction: m.action,
        estimatedMonthlySavingsUsd: 0,
        checkId: `waf.${m.key}`,
        createdAtIso: now,
      };
    });
}

function serializeFinding(f: AuditFinding): SerializedFinding {
  return {
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
  };
}

async function resolveSecopsFindings(event: Input): Promise<SerializedFinding[]> {
  const fromProwler = event.secops?.findings ?? [];
  if (fromProwler.length > 0) return fromProwler;

  if (!event.roleArn || !event.externalId) {
    console.warn('SecOps vacío y sin roleArn/externalId para fallback inline');
    return [];
  }

  console.warn('SecOps vacío (Prowler); ejecutando checks inline IAM/SG/S3', {
    auditId: event.auditId,
    warning: event.secops?.warning,
  });

  try {
    const engine = new ProwlerSecurityEngine();
    const result = await engine.run({
      tenantId: event.tenantId,
      auditId: event.auditId,
      accountId: event.accountId,
      correlationId: event.correlationId,
      roleArn: event.roleArn,
      externalId: event.externalId,
      regions: event.regions ?? [],
    });
    return result.auditFindings.map(serializeFinding);
  } catch (err) {
    console.error('Fallback SecOps inline falló', {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
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

  const inventorySummary = event.finops?.inventorySummary ?? null;
  const secopsFindings = await resolveSecopsFindings(event);

  const securityScore = scoreFromFindings(secopsFindings, 'secops');
  const costScore = scoreFromFindings(event.finops?.findings ?? [], 'finops');
  const pillarScores: WafPillarScores = {
    operationalExcellence: Math.round((securityScore + costScore) / 2),
    security: securityScore,
    reliability: Math.max(0, securityScore - 5),
    performanceEfficiency: costScore,
    costOptimization: costScore,
    sustainability: Math.round(costScore * 0.9),
  };

  const archSerialized = architectureFindingsFromPillars({
    tenantId: event.tenantId,
    auditId: event.auditId,
    pillarScores,
  });

  const allSerialized = [
    ...(event.finops?.findings ?? []),
    ...secopsFindings,
    ...archSerialized,
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

  const completed = audit.withAggregation({
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

  let reportId: string | null = null;
  let reportS3Key: string | null = null;
  let aiGenerated = false;
  let reportInventory = inventorySummary;

  try {
    const report = await reports.generate({
      audit: completed,
      findings,
      inventorySummary,
    });
    reportId = report.reportId;
    reportS3Key = report.s3Key;
    aiGenerated = report.aiGenerated;
    reportInventory = report.inventorySummary;
  } catch (err) {
    console.error('Generación de informe falló; audit queda completed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    auditId: completed.auditId,
    status: completed.status,
    findingCount: completed.findingCount,
    criticalCount: completed.criticalCount,
    highCount: completed.highCount,
    globalScore: completed.globalScore,
    estimatedMonthlySavingsUsd: completed.estimatedMonthlySavingsUsd,
    reportId,
    reportS3Key,
    aiGenerated,
    inventorySummary: reportInventory,
    secopsFindingCount: secopsFindings.length,
  };
};
