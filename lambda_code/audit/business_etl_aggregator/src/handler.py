"""
AWS Lambda entrypoint — Business ETL Aggregator (Python 3.11+).

Procesa los 4 artefactos del scanner (CloudQuery, Prowler, Trivy, Infracost):
  filtro → mapa check_id → Bedrock subset → Pricing → Dynamo FINDING#etl#

Env:
  DYNAMODB_TABLE_NAME / TABLE_NAME / CORE_TABLE_NAME
  PROWLER_FINDINGS_BUCKET
  BEDROCK_MODEL_ID
  ETL_SKIP_BEDROCK=true     → nunca Bedrock
  ETL_BEDROCK_MAX=25        → tope de llamadas Bedrock (por check_id único)
  ETL_BEDROCK_SEVERITIES=CRITICAL,HIGH,MEDIUM
  ETL_DRY_RUN=true
  FRIENDLY_COPY_TTL_DAYS=90
"""

from __future__ import annotations

import logging
from typing import Any

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
            "has_finops": isinstance(event.get("finops"), dict),
            "has_secops": isinstance(event.get("secops"), dict),
            "has_appsec": isinstance(event.get("appsec"), dict),
        },
    )
    result = run_pipeline(event)  # type: ignore[arg-type]
    logger.info(
        "business_etl_done",
        extra={
            k: result.get(k)
            for k in (
                "engineCounts",
                "enrichedCount",
                "mappedWithoutBedrock",
                "bedrockClassified",
                "friendlyFromDict",
                "friendlyFromBedrock",
                "friendlyFromCache",
                "operationalPatched",
                "CalculatedSavingsNumeric",
                "dynamoWritten",
            )
        },
    )
    return result


handler = lambda_handler
