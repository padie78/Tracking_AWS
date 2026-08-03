"""
AWS Lambda entrypoint — Business ETL Aggregator (Python 3.11+).

Event mínimo:
{
  "TenantId": "demo",          # o tenantId
  "AwsAccountId": "123456789012",  # o accountId
  "auditId": "uuid",
  "correlationId": "…",
  "raw_findings": [ … ],       # opcional
  "secops": { "sourceBucket": "…", "sourceKey": "…" },
  "finops": { "findings": [ … ] },
  "appsec": { … }
}

Env:
  DYNAMODB_TABLE_NAME   (required para persistir)
  BEDROCK_MODEL_ID      (default Claude 3 Haiku)
  BEDROCK_REGION
  ETL_SKIP_BEDROCK=true → heurística local (dev/tests)
  ETL_DRY_RUN=true      → no escribe Dynamo
"""

from __future__ import annotations

import logging
from typing import Any

from models import AggregatorEvent
from orchestrator import run_pipeline

logger = logging.getLogger()
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    logger.info(
        "business_etl_start",
        extra={
            "has_tenant": bool(event.get("TenantId") or event.get("tenantId")),
            "has_account": bool(event.get("AwsAccountId") or event.get("accountId")),
            "auditId": event.get("auditId"),
        },
    )
    result = run_pipeline(event)  # type: ignore[arg-type]
    logger.info("business_etl_done", extra={k: result.get(k) for k in ("enrichedCount", "CalculatedSavingsNumeric", "dynamoWritten")})
    return result


# Alias por si el handler TF apunta a index.handler
handler = lambda_handler
