"""Orquestador del pipeline ETL (SOLID: aplicación orquesta, adapters aislados)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import boto3

from bedrock_classifier import classify_finding_with_bedrock
from cost_math import compute_calculated_savings_usd
from dictionary_metadata import COST_FINDING_IDS
from dynamodb_writer import put_audit_summary, put_enriched_findings
from i18n_resolver import build_i18n_bundle, resolve_locale_key, resolve_metadata
from models import AggregatorEvent, EnrichedFinding, LlmClassification
from noise_filter import prefilter_findings

logger = logging.getLogger(__name__)


def extract_tenant_ids(event: AggregatorEvent) -> tuple[str, str, str, str]:
    """
    Obligatorio: TenantId (SaaS) + AwsAccountId (cuenta física).
    Compat: tenantId / accountId del SFN TypeScript actual.
    """
    tenant_id = str(event.get("TenantId") or event.get("tenantId") or "").strip()
    account_id = str(event.get("AwsAccountId") or event.get("accountId") or "").strip()
    audit_id = str(event.get("auditId") or "").strip()
    correlation_id = str(event.get("correlationId") or "").strip()

    if not tenant_id:
        raise ValueError("TenantId/tenantId es obligatorio para aislamiento multi-tenant")
    if not account_id or not account_id.isdigit() or len(account_id) != 12:
        raise ValueError("AwsAccountId/accountId debe ser un ID de cuenta AWS de 12 dígitos")
    if not audit_id:
        raise ValueError("auditId es obligatorio")
    return tenant_id, account_id, audit_id, correlation_id


def _load_json_from_s3(bucket: str, key: str) -> Any:
    client = boto3.client("s3")
    obj = client.get_object(Bucket=bucket, Key=key)
    body = obj["Body"].read()
    return json.loads(body)


def collect_raw_rows(event: AggregatorEvent) -> list[dict[str, Any]]:
    """Une findings inline + artefactos S3 (Prowler/Trivy) + finops.resources findings."""
    rows: list[dict[str, Any]] = []

    for key in ("raw_findings", "findings"):
        block = event.get(key)
        if isinstance(block, list):
            rows.extend([r for r in block if isinstance(r, dict)])

    for engine_key in ("secops", "appsec", "finops"):
        engine = event.get(engine_key)
        if not isinstance(engine, dict):
            continue
        inline = engine.get("findings")
        if isinstance(inline, list):
            for r in inline:
                if isinstance(r, dict):
                    enriched = {**r, "_source_engine": engine_key}
                    rows.append(enriched)

        bucket = engine.get("sourceBucket") or event.get("sourceBucket")
        s3_key = engine.get("sourceKey") or event.get("sourceKey")
        if bucket and s3_key:
            try:
                payload = _load_json_from_s3(str(bucket), str(s3_key))
                findings = payload.get("findings") if isinstance(payload, dict) else payload
                if isinstance(findings, list):
                    for r in findings:
                        if isinstance(r, dict):
                            rows.append({**r, "_source_engine": engine_key})
            except Exception:
                logger.exception("s3_load_failed", extra={"bucket": bucket, "key": s3_key})

    # Dedup superficial por JSON
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for r in rows:
        sig = json.dumps(r, sort_keys=True, default=str)[:2000]
        if sig in seen:
            continue
        seen.add(sig)
        unique.append(r)
    return unique


def _domain_for(finding_id: str, native_code: str) -> str:
    if (
        finding_id in COST_FINDING_IDS
        or native_code in COST_FINDING_IDS
        or finding_id.startswith("COST_")
        or native_code.startswith("COST_")
    ):
        return "finops"
    return "secops"


def _enrich_one(
    *,
    tenant_id: str,
    aws_account_id: str,
    audit_id: str,
    raw: dict[str, Any],
    classified: LlmClassification,
) -> EnrichedFinding:
    locale_key = resolve_locale_key(classified["native_code"], classified["finding_id"])
    metadata = resolve_metadata(locale_key)
    variables = classified["extracted_variables"]

    savings = 0.0
    if (
        classified["finding_id"] in COST_FINDING_IDS
        or classified["native_code"] in COST_FINDING_IDS
        or classified["finding_id"].startswith("COST_")
    ):
        savings = compute_calculated_savings_usd(
            classified["finding_id"],
            classified["native_code"],
            variables,
        )

    i18n = build_i18n_bundle(locale_key, variables, savings)
    domain = _domain_for(classified["finding_id"], classified["native_code"])
    source = str(raw.get("_source_engine") or raw.get("engine") or "unknown")
    title = str(raw.get("title") or raw.get("Title") or raw.get("check_id") or "")

    return EnrichedFinding(
        tenant_id=tenant_id,
        aws_account_id=aws_account_id,
        audit_id=audit_id,
        finding_id=classified["finding_id"],
        native_code=classified["native_code"],
        resolved_locale_key=locale_key,
        resource_id=classified["resource_id"],
        extracted_variables=variables,
        metadata=metadata,
        i18n=i18n,
        calculated_savings_usd=savings,
        domain=domain,  # type: ignore[arg-type]
        source_engine=source,
        raw_title=title,
    )


def run_pipeline(event: AggregatorEvent) -> dict[str, Any]:
    tenant_id, account_id, audit_id, correlation_id = extract_tenant_ids(event)

    raw_rows = collect_raw_rows(event)
    filtered = prefilter_findings(raw_rows)
    logger.info(
        "prefilter_stats",
        extra={"raw": len(raw_rows), "kept": len(filtered), "dropped": len(raw_rows) - len(filtered)},
    )

    dry_run = os.environ.get("ETL_DRY_RUN", "").lower() in {"1", "true", "yes"}
    skip_bedrock = os.environ.get("ETL_SKIP_BEDROCK", "").lower() in {"1", "true", "yes"}

    enriched: list[EnrichedFinding] = []
    ignored = 0
    errors = 0

    for row in filtered:
        try:
            if skip_bedrock:
                classified = _heuristic_classify(row)
            else:
                classified = classify_finding_with_bedrock(row)
            if classified is None:
                ignored += 1
                continue
            enriched.append(
                _enrich_one(
                    tenant_id=tenant_id,
                    aws_account_id=account_id,
                    audit_id=audit_id,
                    raw=row,
                    classified=classified,
                )
            )
        except Exception:
            errors += 1
            logger.exception("row_pipeline_failed")

    total_savings = sum(f.calculated_savings_usd for f in enriched)
    critical = sum(1 for f in enriched if f.metadata["severity"] == "CRITICAL")

    written = 0
    if not dry_run and enriched:
        written = put_enriched_findings(enriched)
        try:
            put_audit_summary(
                tenant_id=tenant_id,
                aws_account_id=account_id,
                audit_id=audit_id,
                correlation_id=correlation_id,
                finding_count=len(enriched),
                critical_count=critical,
                estimated_monthly_savings_usd=total_savings,
            )
        except Exception:
            # Soft: findings ya persistidos; el job AUDIT# puede no existir aún.
            logger.exception("audit_patch_failed")

    return {
        "ok": True,
        "TenantId": tenant_id,
        "AwsAccountId": account_id,
        "auditId": audit_id,
        "rawCount": len(raw_rows),
        "filteredCount": len(filtered),
        "enrichedCount": len(enriched),
        "ignoredByLlm": ignored,
        "rowErrors": errors,
        "criticalCount": critical,
        "CalculatedSavingsNumeric": round(total_savings, 4),
        "dynamoWritten": written,
        "dryRun": dry_run,
    }


def _heuristic_classify(row: dict[str, Any]) -> LlmClassification | None:
    """Fallback offline / tests sin Bedrock (mismo contrato de variables)."""
    blob = json.dumps(row, default=str).lower()
    region = str(row.get("region") or row.get("Region") or "unknown")
    resource_id = str(
        row.get("resource_id")
        or row.get("resourceId")
        or row.get("resourceArn")
        or row.get("id")
        or "unknown"
    )
    variables = {
        "region": region,
        "volume_type": str(row.get("volume_type") or row.get("volumeType") or "unknown"),
        "gb": int(row.get("gb") or row.get("size_gb") or row.get("sizeGb") or 0),
        "instance_type": str(row.get("instance_type") or row.get("instanceType") or "unknown"),
        "retention_days": int(row.get("retention_days") or row.get("retentionInDays") or 0),
    }

    if "mfa" in blob:
        return {
            "finding_id": "SEC_IAM_HARDENING",
            "native_code": "aws_iam_user_mfa_enabled",
            "resource_id": resource_id,
            "extracted_variables": variables,  # type: ignore[typeddict-item]
        }
    if "ssh" in blob or "0.0.0.0/0" in blob:
        return {
            "finding_id": "SEC_NETWORK_EXPOSED",
            "native_code": "aws_security_group_ssh_open",
            "resource_id": resource_id,
            "extracted_variables": variables,  # type: ignore[typeddict-item]
        }
    if "unattached" in blob or "ebs" in blob and "orphan" in blob:
        return {
            "finding_id": "COST_EBS_UNUSED",
            "native_code": "ebs_volume_unattached",
            "resource_id": resource_id,
            "extracted_variables": variables,  # type: ignore[typeddict-item]
        }
    if "cve-" in blob or row.get("vulnerabilityId"):
        return {
            "finding_id": "SEC_VULNERABILITY",
            "native_code": str(row.get("vulnerabilityId") or "SEC_VULNERABILITY"),
            "resource_id": resource_id,
            "extracted_variables": variables,  # type: ignore[typeddict-item]
        }
    status = str(row.get("status") or "").upper()
    if status in {"PASS", "OK", "SUCCESS", "INFO"}:
        return None
    return {
        "finding_id": "SEC_GENERIC_ALERT",
        "native_code": str(row.get("check_id") or row.get("checkId") or "SEC_GENERIC_ALERT"),
        "resource_id": resource_id,
        "extracted_variables": variables,  # type: ignore[typeddict-item]
    }
