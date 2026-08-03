"""
AWS Lambda entrypoint — Business ETL Aggregator (Python 3.11+).

Modos:
  - default / audit pipeline: filtro → mapa → Bedrock → Pricing → Dynamo
  - pricing_refresh: job semanal EventBridge (caché SYSTEM#AWS_PRICING)

Env:
  DYNAMODB_TABLE_NAME / TABLE_NAME / CORE_TABLE_NAME
  PROWLER_FINDINGS_BUCKET
  BEDROCK_MODEL_ID
  ETL_SKIP_BEDROCK=true
  ETL_BEDROCK_MAX=40
  ETL_BEDROCK_SEVERITIES=CRITICAL,HIGH,MEDIUM
  ETL_DRY_RUN=true
  FRIENDLY_COPY_TTL_DAYS=90
  PRICING_CACHE_TTL_DAYS=14
"""

from __future__ import annotations

import logging
from typing import Any

from orchestrator import run_pipeline
from pricing_refresh import refresh_pricing_cache

logger = logging.getLogger()
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)


def _is_pricing_refresh(event: dict[str, Any]) -> bool:
    if str(event.get("mode") or "").lower() in {"pricing_refresh", "refresh_pricing"}:
        return True
    # EventBridge scheduled rule detail-type / source
    if event.get("source") == "aws.events" and "pricing" in str(
        event.get("detail-type") or event.get("resources") or ""
    ).lower():
        return True
    # Payload fijo del schedule terraform
    if event.get("job") == "pricing_cache_weekly_refresh":
        return True
    return False


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    event = event or {}

    if _is_pricing_refresh(event):
        logger.info("pricing_refresh_start")
        result = refresh_pricing_cache()
        logger.info(
            "pricing_refresh_done",
            extra={
                k: result.get(k)
                for k in ("seededCount", "refreshedCount", "changedCount")
            },
        )
        return result

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
