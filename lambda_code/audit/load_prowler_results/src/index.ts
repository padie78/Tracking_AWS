import type { Handler } from 'aws-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

type Input = {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
};

type FindingRow = {
  findingId: string;
  domain: string;
  category: string;
  severity: string;
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

const s3 = new S3Client({});

async function readBody(bucket: string, key: string): Promise<string> {
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  return (await result.Body?.transformToString('utf-8')) ?? '';
}

export const handler: Handler<Input> = async (event) => {
  const bucket = process.env['PROWLER_FINDINGS_BUCKET'];
  if (!bucket) throw new Error('Missing env PROWLER_FINDINGS_BUCKET');

  const key =
    process.env['PROWLER_FINDINGS_KEY_TEMPLATE']?.replace(
      '{tenantId}',
      event.tenantId,
    ).replace('{auditId}', event.auditId) ??
    `tenants/${event.tenantId}/audits/${event.auditId}/prowler/findings.json`;

  try {
    const raw = await readBody(bucket, key);
    const parsed = JSON.parse(raw) as { findings?: FindingRow[] };
    return {
      findings: parsed.findings ?? [],
      engine: 'prowler-fargate',
      sourceKey: key,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Si el task falló antes de subir, devolver vacío (aggregate sigue con FinOps)
    console.error('load_prowler_results failed', { key, message });
    return {
      findings: [] as FindingRow[],
      engine: 'prowler-fargate',
      sourceKey: key,
      warning: message,
    };
  }
};
