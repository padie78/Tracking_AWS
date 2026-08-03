"""
Pipeline ETL negocio (4 motores):

  1) Cargar CloudQuery + Prowler + Trivy + Infracost
  2) Filtro Python (PASS/OK fuera)
  3) Mapa check_id → native_code / i18n (sin Bedrock)
  4) Bedrock SOLO subset: desconocidos + CRITICAL/HIGH, tope N
  5) Pricing API + math CPU → Dynamo FINDING#etl#
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from bedrock_classifier import classify_finding_with_bedrock
from check_id_mapper import map_row_to_classification, severity_rank
from cost_math import compute_calculated_savings_usd
from dictionary_metadata import COST_FINDING_IDS
from dynamodb_writer import put_audit_summary, put_enriched_findings
from engine_sources import collect_four_engine_rows, flatten_and_dedupe
from i18n_resolver import build_i18n_bundle, resolve_locale_key, resolve_metadata
from models import AggregatorEvent, EnrichedFinding, LlmClassification
from noise_filter import prefilter_findings

logger = logging.getLogger(__name__)


def extract_tenant_ids(event: AggregatorEvent) -> tuple[str, str, str, str]:
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
        # Preferir ahorro ya estimado en la fila (CloudQuery/Infracost) si Pricing falla/0
        savings = compute_calculated_savings_usd(
            classified["finding_id"],
            classified["native_code"],
            variables,
        )
        if savings <= 0:
            try:
                savings = float(
                    raw.get("estimatedMonthlySavingsUsd")
                    or raw.get("monthlyCost")
                    or 0
                )
            except (TypeError, ValueError):
                savings = 0.0

    i18n = build_i18n_bundle(locale_key, variables, savings)
    domain = _domain_for(classified["finding_id"], classified["native_code"])
    source = str(raw.get("_source_engine") or raw.get("engine") or "unknown")
    title = str(raw.get("title") or raw.get("Title") or raw.get("checkId") or "")

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


def _bedrock_allowed(row: dict[str, Any], mapped_ok: bool) -> bool:
    """Bedrock solo si el mapa falló (desconocido) y severidad alta, con tope global."""
    if os.environ.get("ETL_SKIP_BEDROCK", "").lower() in {"1", "true", "yes"}:
        return False
    if mapped_ok:
        return False
    allowed = {
        s.strip().upper()
        for s in os.environ.get("ETL_BEDROCK_SEVERITIES", "CRITICAL,HIGH").split(",")
        if s.strip()
    }
    sev = str(row.get("severity") or row.get("Severity") or "MEDIUM").upper()
    return sev in allowed or not allowed


def _bedrock_max() -> int:
    try:
        return max(0, int(os.environ.get("ETL_BEDROCK_MAX", "25")))
    except ValueError:
        return 25


def run_pipeline(event: AggregatorEvent) -> dict[str, Any]:
    tenant_id, account_id, audit_id, correlation_id = extract_tenant_ids(event)

    # —— 1) Cuatro motores ——
    by_engine = collect_four_engine_rows(dict(event))
    engine_counts = {k: len(v) for k, v in by_engine.items()}
    raw_rows = flatten_and_dedupe(by_engine)

    # —— 2) Filtro ruido ——
    filtered = prefilter_findings(raw_rows)
    filtered.sort(key=severity_rank)

    logger.info(
        "etl_ingest",
        extra={
            "engines": engine_counts,
            "raw": len(raw_rows),
            "filtered": len(filtered),
        },
    )

    dry_run = os.environ.get("ETL_DRY_RUN", "").lower() in {"1", "true", "yes"}
    bedrock_budget = _bedrock_max()
    bedrock_used = 0
    mapped_count = 0
    bedrock_count = 0
    ignored = 0
    errors = 0

    enriched: list[EnrichedFinding] = []

    for row in filtered:
        try:
            # —— 3) Mapa local ——
            classified, mapped_ok = map_row_to_classification(row)
            if classified is None:
                ignored += 1
                continue

            # —— 4) Bedrock subset ——
            if _bedrock_allowed(row, mapped_ok) and bedrock_used < bedrock_budget:
                try:
                    ai = classify_finding_with_bedrock(row)
                    bedrock_used += 1
                    if ai is not None:
                        classified = ai
                        bedrock_count += 1
                        time.sleep(0.15)  # alivia throttle
                    else:
                        # IGNORAR del modelo: descartamos
                        ignored += 1
                        continue
                except Exception:
                    bedrock_used += 1
                    logger.warning(
                        "bedrock_row_failed_using_map",
                        exc_info=True,
                    )
                    # seguimos con el mapa genérico
                    mapped_count += 1
            else:
                if mapped_ok:
                    mapped_count += 1
                else:
                    # desconocido sin cupo Bedrock → genérico
                    mapped_count += 1

            # —— 5) Pricing + i18n ——
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
            logger.exception("audit_patch_failed")

    return {
        "ok": True,
        "TenantId": tenant_id,
        "AwsAccountId": account_id,
        "auditId": audit_id,
        "engineCounts": engine_counts,
        "rawCount": len(raw_rows),
        "filteredCount": len(filtered),
        "enrichedCount": len(enriched),
        "mappedWithoutBedrock": mapped_count,
        "bedrockClassified": bedrock_count,
        "bedrockBudgetUsed": bedrock_used,
        "ignored": ignored,
        "rowErrors": errors,
        "criticalCount": critical,
        "CalculatedSavingsNumeric": round(total_savings, 4),
        "dynamoWritten": written,
        "dryRun": dry_run,
    }
