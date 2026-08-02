import type { Handler } from 'aws-lambda';
import type { AuditPayload } from '@track-aws/domain';
import {
  AssumeRoleAwsInventoryAdapter,
  CloudQueryInventoryEngine,
  CLOUDQUERY_PARQUET_SCHEMA,
  estimateInfracostFromInventory,
  HistoricalParquetWriter,
  INFRACOST_PARQUET_SCHEMA,
} from '@track-aws/infrastructure';

export const handler: Handler<AuditPayload> = async (event) => {
  const engine = new CloudQueryInventoryEngine(new AssumeRoleAwsInventoryAdapter());
  const result = await engine.run(event);

  const findingRows = result.auditFindings.map((f) => ({
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

  const infracostLines = estimateInfracostFromInventory({
    accountId: event.accountId,
    auditId: event.auditId,
    resources: result.resources,
  });

  let parquetUri: string | null = null;
  let infracostParquetUri: string | null = null;
  try {
    const writer = new HistoricalParquetWriter();
    const rows = [
      ...result.resources.map((r) => ({
        row_kind: 'resource',
        resource_type: r.resourceType,
        resource_id: r.resourceId,
        resource_arn: r.resourceArn,
        region: r.region,
        state: r.state,
        detail: r.detail,
        estimated_monthly_cost_usd: r.estimatedMonthlyCostUsd,
        finding_id: null,
        domain: null,
        category: null,
        severity: null,
        title: null,
        rationale: null,
        recommended_action: null,
        estimated_monthly_savings_usd: null,
        check_id: null,
      })),
      ...findingRows.map((f) => ({
        row_kind: 'finding',
        resource_type: null,
        resource_id: f.resourceId,
        resource_arn: f.resourceArn,
        region: f.region,
        state: null,
        detail: null,
        estimated_monthly_cost_usd: null,
        finding_id: f.findingId,
        domain: f.domain,
        category: f.category,
        severity: f.severity,
        title: f.title,
        rationale: f.rationale,
        recommended_action: f.recommendedAction,
        estimated_monthly_savings_usd: f.estimatedMonthlySavingsUsd,
        check_id: f.checkId,
      })),
    ];

    const written = await writer.write({
      engine: 'cloudquery',
      awsAccountId: event.accountId,
      orgTenantId: event.tenantId,
      auditId: event.auditId,
      correlationId: event.correlationId,
      rows,
      schema: CLOUDQUERY_PARQUET_SCHEMA,
    });
    parquetUri = written.s3Uri;
    console.info('cloudquery parquet written', {
      s3Uri: written.s3Uri,
      rowCount: written.rowCount,
    });

    const infracostWritten = await writer.write({
      engine: 'infracost',
      awsAccountId: event.accountId,
      orgTenantId: event.tenantId,
      auditId: event.auditId,
      correlationId: event.correlationId,
      schema: INFRACOST_PARQUET_SCHEMA,
      rows: infracostLines.map((line) => ({
        project_name: line.project_name,
        resource_name: line.resource_name,
        resource_type: line.resource_type,
        monthly_cost_usd: line.monthly_cost_usd,
        hourly_cost_usd: line.hourly_cost_usd,
        currency: line.currency,
      })),
    });
    infracostParquetUri = infracostWritten.s3Uri;
    console.info('infracost parquet written', {
      s3Uri: infracostWritten.s3Uri,
      rowCount: infracostWritten.rowCount,
    });
  } catch (err) {
    // No abortar el audit: el cold path es best-effort en esta etapa.
    console.error('cloudquery/infracost parquet write failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    inventorySummary: result.inventorySummary,
    resources: result.resources,
    findings: findingRows,
    infracostLines,
    parquetUri,
    infracostParquetUri,
  };
};
