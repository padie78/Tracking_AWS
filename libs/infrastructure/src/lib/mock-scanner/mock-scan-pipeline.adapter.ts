import {
  InvokeCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  MOCK_SCANNER_FIXTURES,
  mockScannerKeys,
} from './mock-fixtures';

export type MockScanPipelineInput = {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
  regions?: string[];
};

export type MockScanArtifactRefs = {
  bucket: string;
  keys: ReturnType<typeof mockScannerKeys>;
  finops: {
    findings: unknown[];
    inventorySummary: unknown;
    resources: unknown[];
    infracostLines: unknown[];
  };
  secops: {
    ok: true;
    engine: string;
    sourceBucket: string;
    sourceKey: string;
  };
  appsec: {
    ok: true;
    engine: string;
    sourceBucket: string;
    sourceKey: string;
  };
  komiser: {
    ok: true;
    engine: string;
    sourceBucket: string;
    sourceKey: string;
  };
};

/**
 * Sube los 5 artefactos mock al bucket de findings y dispara aggregate
 * (async). Aggregate encadena Business ETL cuando `mockScan=true`.
 */
export class MockScanPipelineAdapter {
  private readonly s3 = new S3Client({});
  private readonly lambda = new LambdaClient({});

  async writeArtifactsAndStartAggregate(
    input: MockScanPipelineInput,
  ): Promise<MockScanArtifactRefs> {
    const bucket = process.env['PROWLER_FINDINGS_BUCKET'];
    if (!bucket) throw new Error('Missing env PROWLER_FINDINGS_BUCKET');

    const aggregateFn =
      process.env['AGGREGATE_AUDIT_FUNCTION_NAME'] ??
      process.env['AGGREGATE_AUDIT_ARN'];
    if (!aggregateFn) {
      throw new Error('Missing env AGGREGATE_AUDIT_FUNCTION_NAME');
    }

    const keys = mockScannerKeys(input.tenantId, input.auditId);
    const now = new Date().toISOString();

    const cloudquery = {
      ...MOCK_SCANNER_FIXTURES.cloudquery,
      tenantId: input.tenantId,
      auditId: input.auditId,
      accountId: input.accountId,
      exportedAtIso: now,
    };
    const prowler = {
      ...MOCK_SCANNER_FIXTURES.prowler,
      tenantId: input.tenantId,
      auditId: input.auditId,
      exportedAtIso: now,
    };
    const trivy = {
      ...MOCK_SCANNER_FIXTURES.trivy,
      tenantId: input.tenantId,
      auditId: input.auditId,
      exportedAtIso: now,
    };
    const komiser = {
      ...MOCK_SCANNER_FIXTURES.komiser,
      tenantId: input.tenantId,
      auditId: input.auditId,
      accountId: input.accountId,
      exportedAtIso: now,
    };
    const infracost = {
      ...MOCK_SCANNER_FIXTURES.infracost,
      tenantId: input.tenantId,
      auditId: input.auditId,
      accountId: input.accountId,
      exportedAtIso: now,
    };

    await Promise.all([
      this.putJson(bucket, keys.cloudquery, cloudquery),
      this.putJson(bucket, keys.prowler, prowler),
      this.putJson(bucket, keys.trivy, trivy),
      this.putJson(bucket, keys.komiser, komiser),
      this.putJson(bucket, keys.infracost, infracost),
    ]);

    const refs: MockScanArtifactRefs = {
      bucket,
      keys,
      finops: {
        findings: cloudquery.findings ?? [],
        inventorySummary: cloudquery.inventorySummary ?? null,
        resources: cloudquery.resources ?? [],
        infracostLines: infracost.infracostLines ?? [],
      },
      secops: {
        ok: true,
        engine: 'prowler-mock',
        sourceBucket: bucket,
        sourceKey: keys.prowler,
      },
      appsec: {
        ok: true,
        engine: 'trivy-mock',
        sourceBucket: bucket,
        sourceKey: keys.trivy,
      },
      komiser: {
        ok: true,
        engine: 'komiser-mock',
        sourceBucket: bucket,
        sourceKey: keys.komiser,
      },
    };

    const aggregatePayload = {
      mockScan: true,
      tenantId: input.tenantId,
      auditId: input.auditId,
      accountId: input.accountId,
      correlationId: input.correlationId,
      regions: input.regions ?? ['eu-central-1'],
      finops: refs.finops,
      secops: refs.secops,
      appsec: refs.appsec,
      komiser: refs.komiser,
    };

    await this.lambda.send(
      new InvokeCommand({
        FunctionName: aggregateFn,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(aggregatePayload)),
      }),
    );

    return refs;
  }

  private async putJson(
    bucket: string,
    key: string,
    body: unknown,
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: 'application/json',
        Body: JSON.stringify(body),
      }),
    );
  }
}
