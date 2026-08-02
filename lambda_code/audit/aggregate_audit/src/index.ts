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
  DynamoDbAuditInventoryRepository,
  DynamoDbAuditJobRepository,
  estimateInfracostFromInventory,
  HistoricalParquetWriter,
  INFRACOST_PARQUET_SCHEMA,
  PROWLER_PARQUET_SCHEMA,
  ProwlerSecurityEngine,
  TRIVY_PARQUET_SCHEMA,
  type InfracostLineItem,
  type InventorySummaryView,
} from '@track-aws/infrastructure';
import type { InventoryResourceView } from '@track-aws/application';
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
  target?: string;
  vulnerabilityId?: string;
  pkgName?: string;
  installedVersion?: string;
  fixedVersion?: string;
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
    resources?: InventoryResourceView[];
    infracostLines?: InfracostLineItem[];
  };
  secops: { findings: SerializedFinding[]; warning?: string; engine?: string };
  appsec?: { findings: SerializedFinding[]; warning?: string; engine?: string };
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
  const inventoryResources = event.finops?.resources ?? [];
  const inventoryRepo = new DynamoDbAuditInventoryRepository();
  if (inventoryResources.length > 0) {
    await inventoryRepo.saveMany({
      tenantId: event.tenantId,
      auditId: event.auditId,
      accountId: event.accountId,
      resources: inventoryResources,
    });
  }

  const secopsFindings = await resolveSecopsFindings(event);
  const appsecFindings = event.appsec?.findings ?? [];

  const securityScore = scoreFromFindings(
    [...secopsFindings, ...appsecFindings],
    'secops',
  );
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
    ...appsecFindings,
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

  const infracostLines =
    event.finops?.infracostLines ??
    estimateInfracostFromInventory({
      accountId: event.accountId,
      auditId: event.auditId,
      resources: inventoryResources,
    });

  const historicalUris = await writeHistoricalParquetArtifacts({
    tenantId: event.tenantId,
    accountId: event.accountId,
    auditId: event.auditId,
    correlationId: event.correlationId,
    secopsFindings,
    appsecFindings,
    infracostLines,
  });

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
    appsecFindingCount: appsecFindings.length,
    infracostLineCount: infracostLines.length,
    historicalParquet: historicalUris,
  };
};

async function writeHistoricalParquetArtifacts(input: {
  tenantId: string;
  accountId: string;
  auditId: string;
  correlationId: string;
  secopsFindings: SerializedFinding[];
  appsecFindings: SerializedFinding[];
  infracostLines: InfracostLineItem[];
}): Promise<{
  prowler: string | null;
  trivy: string | null;
  infracost: string | null;
}> {
  const out = {
    prowler: null as string | null,
    trivy: null as string | null,
    infracost: null as string | null,
  };

  if (!process.env['DATA_LAKE_BUCKET_NAME']) {
    console.warn('DATA_LAKE_BUCKET_NAME ausente; se omite cold path Parquet');
    return out;
  }

  const writer = new HistoricalParquetWriter();
  const capturedAt = new Date();
  const base = {
    awsAccountId: input.accountId,
    orgTenantId: input.tenantId,
    auditId: input.auditId,
    correlationId: input.correlationId,
    capturedAt,
  };

  try {
    const prowler = await writer.write({
      ...base,
      engine: 'prowler',
      schema: PROWLER_PARQUET_SCHEMA,
      rows: input.secopsFindings.map((f) => ({
        finding_id: f.findingId,
        domain: f.domain,
        category: f.category,
        severity: f.severity,
        resource_arn: f.resourceArn,
        resource_id: f.resourceId,
        region: f.region,
        title: f.title,
        rationale: f.rationale,
        recommended_action: f.recommendedAction,
        estimated_monthly_savings_usd: f.estimatedMonthlySavingsUsd,
        check_id: f.checkId,
      })),
    });
    out.prowler = prowler.s3Uri;
  } catch (err) {
    console.error('prowler parquet write failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const trivy = await writer.write({
      ...base,
      engine: 'trivy',
      schema: TRIVY_PARQUET_SCHEMA,
      rows: input.appsecFindings.map((f) => ({
        finding_id: f.findingId,
        target: f.target ?? f.resourceArn,
        vulnerability_id: f.vulnerabilityId ?? f.checkId ?? '',
        severity: f.severity,
        pkg_name: f.pkgName ?? f.resourceId,
        installed_version: f.installedVersion ?? '',
        fixed_version: f.fixedVersion ?? '',
        title: f.title,
      })),
    });
    out.trivy = trivy.s3Uri;
  } catch (err) {
    console.error('trivy parquet write failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const infracost = await writer.write({
      ...base,
      engine: 'infracost',
      schema: INFRACOST_PARQUET_SCHEMA,
      rows: input.infracostLines,
    });
    out.infracost = infracost.s3Uri;
  } catch (err) {
    console.error('infracost parquet write failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  console.info('historical parquet artifacts', out);
  return out;
}
