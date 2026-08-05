import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parquetWriteBuffer } from 'hyparquet-writer';
import {
  buildHistoricalParquetKey,
  type HistoricalEngine,
} from '@track-aws/common';

export type ParquetCell = string | number | boolean | null;

export type ParquetRow = Record<string, ParquetCell>;

export type ParquetColumnType = 'STRING' | 'DOUBLE' | 'BOOLEAN' | 'INT32';

export interface ParquetColumnSchema {
  name: string;
  type: ParquetColumnType;
}

export interface WriteHistoricalParquetInput {
  engine: HistoricalEngine;
  /** AWS account 12 dígitos → partición tenant_id en S3. */
  awsAccountId: string;
  /** Tenant Cognito SaaS (columna org_tenant_id). */
  orgTenantId: string;
  auditId?: string;
  correlationId?: string;
  rows: ParquetRow[];
  /** Schema obligatorio si rows está vacío (p. ej. sin imágenes ECR / sin costos). */
  schema: ParquetColumnSchema[];
  capturedAt?: Date;
  bucketName?: string;
}

export interface WriteHistoricalParquetResult {
  bucket: string;
  key: string;
  filenamePrefix: string;
  rowCount: number;
  s3Uri: string;
}

function requireDataLakeBucket(explicit?: string): string {
  const name = explicit ?? process.env['DATA_LAKE_BUCKET_NAME'];
  if (!name) throw new Error('Missing env DATA_LAKE_BUCKET_NAME');
  return name;
}

function cellToTyped(
  value: ParquetCell | undefined,
  type: ParquetColumnType,
): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'STRING':
      return String(value);
    case 'DOUBLE':
      return typeof value === 'number' ? value : Number(value);
    case 'INT32':
      return typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
    case 'BOOLEAN':
      return Boolean(value);
    default:
      return String(value);
  }
}

/**
 * Escribe Parquet Snappy-compatible (hyparquet-writer) append-only al data lake.
 * No sobrescribe: cada llamada genera un filename_prefix distinto (minuto UTC).
 */
export class HistoricalParquetWriter {
  constructor(private readonly s3 = new S3Client({})) {}

  async write(input: WriteHistoricalParquetInput): Promise<WriteHistoricalParquetResult> {
    const bucket = requireDataLakeBucket(input.bucketName);
    const capturedAt = input.capturedAt ?? new Date();
    const { key, filenamePrefix } = buildHistoricalParquetKey({
      engine: input.engine,
      awsAccountId: input.awsAccountId,
      capturedAt,
    });

    const enriched: ParquetRow[] = input.rows.map((row) => ({
      org_tenant_id: input.orgTenantId,
      aws_account_id: input.awsAccountId,
      audit_id: input.auditId ?? null,
      correlation_id: input.correlationId ?? null,
      captured_at_iso: capturedAt.toISOString(),
      ...row,
    }));

    const baseSchema: ParquetColumnSchema[] = [
      { name: 'org_tenant_id', type: 'STRING' },
      { name: 'aws_account_id', type: 'STRING' },
      { name: 'audit_id', type: 'STRING' },
      { name: 'correlation_id', type: 'STRING' },
      { name: 'captured_at_iso', type: 'STRING' },
    ];

    const seen = new Set(baseSchema.map((c) => c.name));
    const schema: ParquetColumnSchema[] = [...baseSchema];
    for (const col of input.schema) {
      if (seen.has(col.name)) continue;
      seen.add(col.name);
      schema.push(col);
    }
    // Cualquier columna extra en rows
    for (const row of enriched) {
      for (const name of Object.keys(row)) {
        if (seen.has(name)) continue;
        seen.add(name);
        schema.push({ name, type: 'STRING' });
      }
    }

    const columnData = schema.map((col) => ({
      name: col.name,
      type: col.type,
      data: enriched.map((row) => cellToTyped(row[col.name], col.type)),
    }));

    const arrayBuffer = parquetWriteBuffer({ columnData });
    const body = Buffer.from(arrayBuffer);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/vnd.apache.parquet',
        Metadata: {
          engine: input.engine,
          aws_account_id: input.awsAccountId,
          org_tenant_id: input.orgTenantId,
          filename_prefix: filenamePrefix,
        },
      }),
    );

    return {
      bucket,
      key,
      filenamePrefix,
      rowCount: enriched.length,
      s3Uri: `s3://${bucket}/${key}`,
    };
  }
}

export const CLOUDQUERY_PARQUET_SCHEMA: ParquetColumnSchema[] = [
  { name: 'resource_type', type: 'STRING' },
  { name: 'resource_id', type: 'STRING' },
  { name: 'resource_arn', type: 'STRING' },
  { name: 'region', type: 'STRING' },
  { name: 'state', type: 'STRING' },
  { name: 'detail', type: 'STRING' },
  { name: 'estimated_monthly_cost_usd', type: 'DOUBLE' },
  { name: 'row_kind', type: 'STRING' },
  { name: 'finding_id', type: 'STRING' },
  { name: 'domain', type: 'STRING' },
  { name: 'category', type: 'STRING' },
  { name: 'severity', type: 'STRING' },
  { name: 'title', type: 'STRING' },
  { name: 'rationale', type: 'STRING' },
  { name: 'recommended_action', type: 'STRING' },
  { name: 'estimated_monthly_savings_usd', type: 'DOUBLE' },
  { name: 'check_id', type: 'STRING' },
];

export const PROWLER_PARQUET_SCHEMA: ParquetColumnSchema[] = [
  { name: 'finding_id', type: 'STRING' },
  { name: 'domain', type: 'STRING' },
  { name: 'category', type: 'STRING' },
  { name: 'severity', type: 'STRING' },
  { name: 'resource_arn', type: 'STRING' },
  { name: 'resource_id', type: 'STRING' },
  { name: 'region', type: 'STRING' },
  { name: 'title', type: 'STRING' },
  { name: 'rationale', type: 'STRING' },
  { name: 'recommended_action', type: 'STRING' },
  { name: 'estimated_monthly_savings_usd', type: 'DOUBLE' },
  { name: 'check_id', type: 'STRING' },
];

/** Schema Trivy AppSec (Fargate → load_trivy_results → aggregate). */
export const TRIVY_PARQUET_SCHEMA: ParquetColumnSchema[] = [
  { name: 'finding_id', type: 'STRING' },
  { name: 'target', type: 'STRING' },
  { name: 'vulnerability_id', type: 'STRING' },
  { name: 'severity', type: 'STRING' },
  { name: 'pkg_name', type: 'STRING' },
  { name: 'installed_version', type: 'STRING' },
  { name: 'fixed_version', type: 'STRING' },
  { name: 'title', type: 'STRING' },
];

/** Schema Infracost (estimación desde inventario CloudQuery; CLI TF plan = etapa posterior). */
export const INFRACOST_PARQUET_SCHEMA: ParquetColumnSchema[] = [
  { name: 'project_name', type: 'STRING' },
  { name: 'resource_name', type: 'STRING' },
  { name: 'resource_type', type: 'STRING' },
  { name: 'monthly_cost_usd', type: 'DOUBLE' },
  { name: 'hourly_cost_usd', type: 'DOUBLE' },
  { name: 'currency', type: 'STRING' },
];

/** Schema Komiser (inventario financiero Fargate → S3 JSON). */
export const KOMISER_PARQUET_SCHEMA: ParquetColumnSchema[] = [
  { name: 'resource_id', type: 'STRING' },
  { name: 'name', type: 'STRING' },
  { name: 'service', type: 'STRING' },
  { name: 'region', type: 'STRING' },
  { name: 'provider', type: 'STRING' },
  { name: 'monthly_cost_usd', type: 'DOUBLE' },
  { name: 'link', type: 'STRING' },
];
