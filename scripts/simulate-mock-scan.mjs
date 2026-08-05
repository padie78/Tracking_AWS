#!/usr/bin/env node
/**
 * CLI: escribe los 5 fixtures mock en S3, crea AuditJob y dispara aggregate+ETL.
 *
 * Uso:
 *   node scripts/simulate-mock-scan.mjs --tenant demo --account 473959757331
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REGION = process.env.AWS_REGION || 'eu-central-1';
const TABLE = process.env.CORE_TABLE_NAME || 'track-aws-dev-core';
const BUCKET =
  process.env.PROWLER_FINDINGS_BUCKET ||
  'track-aws-dev-artifacts-473959757331';
const AGGREGATE =
  process.env.AGGREGATE_AUDIT_FUNCTION_NAME || 'track-aws-dev-aggregate-audit';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function loadFixture(name) {
  return JSON.parse(
    readFileSync(
      resolve(ROOT, 'integrations/mock-scanner/fixtures', name),
      'utf8',
    ),
  );
}

async function main() {
  const tenantId = arg('tenant', 'demo');
  const accountId = arg('account', '473959757331');
  const auditId = randomUUID();
  const correlationId = randomUUID();
  const now = new Date().toISOString();
  const base = `tenants/${tenantId}/audits/${auditId}`;
  const keys = {
    cloudquery: `${base}/cloudquery/findings.json`,
    prowler: `${base}/prowler/findings.json`,
    trivy: `${base}/trivy/findings.json`,
    komiser: `${base}/komiser/findings.json`,
    infracost: `${base}/infracost/lines.json`,
  };

  const cloudquery = {
    ...loadFixture('01-cloudquery-finops.json'),
    tenantId,
    auditId,
    accountId,
    exportedAtIso: now,
  };
  const prowler = {
    ...loadFixture('02-prowler-secops.json'),
    tenantId,
    auditId,
    exportedAtIso: now,
  };
  const trivy = {
    ...loadFixture('03-trivy-appsec.json'),
    tenantId,
    auditId,
    exportedAtIso: now,
  };
  const komiser = {
    ...loadFixture('04-komiser-inventory.json'),
    tenantId,
    auditId,
    accountId,
    exportedAtIso: now,
  };
  const infracost = {
    ...loadFixture('05-infracost-lines.json'),
    tenantId,
    auditId,
    accountId,
    exportedAtIso: now,
  };

  const s3 = new S3Client({ region: REGION });
  const ddb = new DynamoDBClient({ region: REGION });
  const lambda = new LambdaClient({ region: REGION });

  console.log('Writing 5 mock artifacts…', { bucket: BUCKET, auditId });
  for (const [name, key, body] of [
    ['cloudquery', keys.cloudquery, cloudquery],
    ['prowler', keys.prowler, prowler],
    ['trivy', keys.trivy, trivy],
    ['komiser', keys.komiser, komiser],
    ['infracost', keys.infracost, infracost],
  ]) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: 'application/json',
        Body: JSON.stringify(body),
      }),
    );
    console.log('  ✓', name, key);
  }

  const auditItem = {
    PK: `TENANT#${tenantId}`,
    SK: `AUDIT#${auditId}`,
    entityType: 'AUDIT_JOB',
    tenantId,
    TenantId: tenantId,
    auditId,
    accountId,
    AwsAccountId: accountId,
    correlationId,
    status: 'aggregating',
    executionArn: `mock-scan:${auditId}`,
    createdAtIso: now,
    completedAtIso: null,
    findingCount: 0,
    criticalCount: 0,
    highCount: 0,
    estimatedMonthlySavingsUsd: 0,
    globalScore: 0,
    pillarScores: {
      operationalExcellence: 0,
      security: 0,
      reliability: 0,
      performanceEfficiency: 0,
      costOptimization: 0,
      sustainability: 0,
    },
    errorMessage: null,
  };
  await ddb.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: marshall(auditItem, { removeUndefinedValues: true }),
    }),
  );
  console.log('AuditJob saved', auditItem.SK);

  const payload = {
    mockScan: true,
    tenantId,
    auditId,
    accountId,
    correlationId,
    regions: ['eu-central-1'],
    finops: {
      findings: cloudquery.findings ?? [],
      inventorySummary: cloudquery.inventorySummary ?? null,
      resources: cloudquery.resources ?? [],
      infracostLines: infracost.infracostLines ?? [],
    },
    secops: {
      ok: true,
      engine: 'prowler-mock',
      sourceBucket: BUCKET,
      sourceKey: keys.prowler,
    },
    appsec: {
      ok: true,
      engine: 'trivy-mock',
      sourceBucket: BUCKET,
      sourceKey: keys.trivy,
    },
    komiser: {
      ok: true,
      engine: 'komiser-mock',
      sourceBucket: BUCKET,
      sourceKey: keys.komiser,
    },
  };

  console.log('Invoking aggregate (Event)…', AGGREGATE);
  await lambda.send(
    new InvokeCommand({
      FunctionName: AGGREGATE,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  console.log('DONE', { auditId, correlationId, keys });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
