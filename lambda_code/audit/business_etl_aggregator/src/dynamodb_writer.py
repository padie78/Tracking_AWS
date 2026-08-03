"""Persistencia DynamoDB multi-tenant (single-table TENANT#…).

No sobrescribe el AUDIT# del aggregate TypeScript: solo UpdateItem de campos ETL
y findings con SK FINDING#etl#… para no colisionar con findings TS.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable
from uuid import uuid4

import boto3
from botocore.config import Config

from models import EnrichedFinding

logger = logging.getLogger(__name__)


def _table():  # type: ignore[no-untyped-def]
    name = os.environ.get("DYNAMODB_TABLE_NAME") or os.environ.get("TABLE_NAME") or os.environ["CORE_TABLE_NAME"]
    return boto3.resource(
        "dynamodb",
        config=Config(retries={"max_attempts": 5, "mode": "standard"}),
    ).Table(name)


def _to_dynamo(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(round(value, 6)))
    if isinstance(value, dict):
        return {k: _to_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_dynamo(v) for v in value]
    return value


def tenant_pk(tenant_id: str) -> str:
    return f"TENANT#{tenant_id}"


def audit_findings_pk(tenant_id: str, audit_id: str) -> str:
    return f"TENANT#{tenant_id}#AUDIT#{audit_id}"


def finding_sk(domain: str, finding_id: str) -> str:
    """Namespace etl para no pisar FINDING#secops|finops del aggregate TS."""
    return f"FINDING#etl#{domain}#{finding_id}"


def put_enriched_findings(findings: Iterable[EnrichedFinding]) -> int:
    table = _table()
    count = 0
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ttl_days = int(os.environ.get("AUDIT_DETAIL_TTL_DAYS", "30"))
    ttl = int(time.time()) + ttl_days * 86400

    with table.batch_writer(overwrite_by_pkeys=["PK", "SK"]) as batch:
        for f in findings:
            fid = f"{f.native_code}#{f.resource_id}"[:180]
            friendly = f.friendly
            title = (
                (friendly["headline"] if friendly else f.i18n["es"]["explanation"])[:240]
            )
            rationale = (
                friendly["why"] if friendly else f.i18n["es"]["business_impact"]
            )
            action = (
                friendly["action"]
                if friendly
                else f.metadata["solution_slug"]
            )
            item = {
                "PK": audit_findings_pk(f.tenant_id, f.audit_id),
                "SK": finding_sk(f.domain, fid),
                "entityType": "AUDIT_FINDING_ETL",
                "TenantId": f.tenant_id,
                "tenantId": f.tenant_id,
                "AwsAccountId": f.aws_account_id,
                "auditId": f.audit_id,
                "findingId": fid,
                "domain": f.domain,
                "category": f.finding_id,
                "nativeCode": f.native_code,
                "resolvedLocaleKey": f.resolved_locale_key,
                "severity": f.metadata["severity"],
                "resourceId": f.resource_id,
                "resourceArn": f.resource_id,
                "region": f.extracted_variables.get("region", "unknown"),
                "title": title,
                "rationale": rationale,
                "recommendedAction": action,
                "checkId": f.check_id or f.native_code,
                "friendlyHeadline": friendly["headline"] if friendly else title,
                "friendlyWhy": friendly["why"] if friendly else rationale,
                "friendlyAction": friendly["action"] if friendly else action,
                "friendlyArea": friendly["area"] if friendly else f.metadata["aws_service"],
                "estimatedMonthlySavingsUsd": _to_dynamo(f.calculated_savings_usd),
                "CalculatedSavingsNumeric": _to_dynamo(f.calculated_savings_usd),
                "awsService": f.metadata["aws_service"],
                "targetAudience": f.metadata["target_audience"],
                "remediationType": f.metadata["remediation_type"],
                "estimatedTimeToFix": f.metadata["estimated_time_to_fix"],
                "rollbackRisk": f.metadata["rollback_risk"],
                "compliance": f.metadata["compliance"],
                "solutionSlug": f.metadata["solution_slug"],
                "extractedVariables": dict(f.extracted_variables),
                "i18n": {
                    "en": dict(f.i18n["en"]),
                    "es": dict(f.i18n["es"]),
                },
                "sourceEngine": f.source_engine,
                "rawTitle": f.raw_title,
                "createdAtIso": now,
                "ttl": ttl,
                "GSI1PK": f"{tenant_pk(f.tenant_id)}#CATEGORY#{f.domain}",
                "GSI1SK": f"{now}#{fid}",
            }
            batch.put_item(Item=_to_dynamo(item))
            count += 1

    logger.info("dynamo_findings_written", extra={"count": count})
    return count


def patch_operational_findings_friendly(
    *,
    tenant_id: str,
    audit_id: str,
    enriched: Iterable[EnrichedFinding],
) -> int:
    """
    Parcha FINDING#secops|finops|architecture del aggregate TS con friendly*.
    Match por checkId normalizado (y fallback resourceId).
    No toca FINDING#etl#.
    """
    from friendly_copy import normalize_check_key

    by_check: dict[str, EnrichedFinding] = {}
    by_resource: dict[str, EnrichedFinding] = {}
    for f in enriched:
        if not f.friendly:
            continue
        ck = normalize_check_key(f.check_id or f.native_code)
        if ck and ck not in by_check:
            by_check[ck] = f
        rid = (f.resource_id or "").strip()
        if rid and rid not in by_resource:
            by_resource[rid] = f

    if not by_check and not by_resource:
        return 0

    table = _table()
    pk = audit_findings_pk(tenant_id, audit_id)
    patched = 0
    exclusive_start_key: dict[str, Any] | None = None

    while True:
        kwargs: dict[str, Any] = {
            "KeyConditionExpression": "PK = :pk AND begins_with(SK, :sk)",
            "ExpressionAttributeValues": {":pk": pk, ":sk": "FINDING#"},
        }
        if exclusive_start_key:
            kwargs["ExclusiveStartKey"] = exclusive_start_key
        page = table.query(**kwargs)
        for item in page.get("Items") or []:
            sk = str(item.get("SK") or "")
            if sk.startswith("FINDING#etl#"):
                continue
            entity = str(item.get("entityType") or "")
            if entity == "AUDIT_FINDING_ETL":
                continue

            check = normalize_check_key(str(item.get("checkId") or ""))
            resource = str(item.get("resourceId") or "").strip()
            match = by_check.get(check) if check else None
            if match is None and resource:
                match = by_resource.get(resource)
            if match is None or not match.friendly:
                continue

            fr = match.friendly
            try:
                table.update_item(
                    Key={"PK": pk, "SK": sk},
                    UpdateExpression=(
                        "SET friendlyHeadline = :h, friendlyWhy = :w, "
                        "friendlyAction = :a, friendlyArea = :ar, "
                        "title = :h, rationale = :w, recommendedAction = :a"
                    ),
                    ExpressionAttributeValues={
                        ":h": fr["headline"],
                        ":w": fr["why"],
                        ":a": fr["action"],
                        ":ar": fr["area"],
                    },
                )
                patched += 1
            except Exception:
                logger.warning("friendly_patch_item_failed", extra={"sk": sk}, exc_info=True)

        exclusive_start_key = page.get("LastEvaluatedKey")
        if not exclusive_start_key:
            break

    logger.info("operational_findings_friendly_patched", extra={"count": patched})
    return patched


def patch_audit_business_etl(
    *,
    tenant_id: str,
    aws_account_id: str,
    audit_id: str,
    correlation_id: str,
    finding_count: int,
    critical_count: int,
    estimated_monthly_savings_usd: float,
) -> None:
    """Actualiza el job AUDIT# existente sin borrar scores/status del aggregate TS."""
    table = _table()
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    table.update_item(
        Key={"PK": tenant_pk(tenant_id), "SK": f"AUDIT#{audit_id}"},
        UpdateExpression=(
            "SET businessEtlStatus = :st, "
            "businessEtlFindingCount = :fc, "
            "businessEtlCriticalCount = :cc, "
            "businessEtlSavingsUsd = :sv, "
            "businessEtlCompletedAtIso = :ts, "
            "businessEtlCorrelationId = :cid, "
            "AwsAccountId = if_not_exists(AwsAccountId, :acct), "
            "accountId = if_not_exists(accountId, :acct)"
        ),
        ConditionExpression="attribute_exists(PK)",
        ExpressionAttributeValues={
            ":st": "completed",
            ":fc": finding_count,
            ":cc": critical_count,
            ":sv": _to_dynamo(estimated_monthly_savings_usd),
            ":ts": now,
            ":cid": correlation_id or str(uuid4()),
            ":acct": aws_account_id,
        },
    )


def put_audit_summary(
    *,
    tenant_id: str,
    aws_account_id: str,
    audit_id: str,
    correlation_id: str,
    finding_count: int,
    critical_count: int,
    estimated_monthly_savings_usd: float,
    status: str = "completed",
) -> None:
    del status
    patch_audit_business_etl(
        tenant_id=tenant_id,
        aws_account_id=aws_account_id,
        audit_id=audit_id,
        correlation_id=correlation_id,
        finding_count=finding_count,
        critical_count=critical_count,
        estimated_monthly_savings_usd=estimated_monthly_savings_usd,
    )
