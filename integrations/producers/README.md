# Producers

## HTTP scan ingestion

Requiere cuenta previamente vinculada (`linkAwsAccount`).

```bash
SCAN_INGESTION_URL=<terraform output scan_url> \
TENANT_ID=<tenant> \
AWS_ACCOUNT_ID=123456789012 \
npm run send:scan
```

Payload: `{ tenantId, accountId }` → HTTP 202 `{ scanId, correlationId }`.
