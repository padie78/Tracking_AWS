import type { Handler } from 'aws-lambda';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

type Input = {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
};

/** Metadata only — aggregate lee findings desde S3 (evita DataLimitExceeded). */
export const handler: Handler<Input> = async (event) => {
  const bucket = process.env['PROWLER_FINDINGS_BUCKET'];
  if (!bucket) throw new Error('Missing env PROWLER_FINDINGS_BUCKET');

  const key =
    process.env['TRIVY_FINDINGS_KEY_TEMPLATE']?.replace('{tenantId}', event.tenantId).replace(
      '{auditId}',
      event.auditId,
    ) ?? `tenants/${event.tenantId}/audits/${event.auditId}/trivy/findings.json`;

  try {
    const head = await new S3Client({}).send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      engine: 'trivy-fargate',
      sourceBucket: bucket,
      sourceKey: key,
      contentLength: head.ContentLength ?? 0,
      ok: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('load_trivy_results failed', { key, message });
    return {
      engine: 'trivy-fargate',
      sourceBucket: bucket,
      sourceKey: key,
      contentLength: 0,
      ok: false,
      warning: message,
    };
  }
};
