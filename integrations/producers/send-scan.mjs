#!/usr/bin/env node
/**
 * Producer local: encola un scan vía HTTP (scan_ingestion).
 * Requiere que la cuenta ya esté vinculada (linkAwsAccount) en DynamoDB.
 *
 * Uso:
 *   SCAN_INGESTION_URL=https://.../scan \
 *   TENANT_ID=... AWS_ACCOUNT_ID=123456789012 \
 *   node integrations/producers/send-scan.mjs
 */
const url = process.env.SCAN_INGESTION_URL;
const secret = process.env.SCAN_INGESTION_SECRET;

if (!url) {
  console.error('Falta SCAN_INGESTION_URL');
  process.exit(1);
}

const body = {
  tenantId: process.env.TENANT_ID ?? 'tenant-demo',
  accountId: process.env.AWS_ACCOUNT_ID ?? '123456789012',
};

const headers = {
  'content-type': 'application/json',
  ...(secret ? { 'x-scan-secret': secret } : {}),
};

const res = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
