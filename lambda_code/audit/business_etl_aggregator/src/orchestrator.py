"""
Pipeline ETL negocio (4 motores):

  1) Cargar CloudQuery + Prowler + Trivy + Infracost
  2) Filtro Python (PASS/OK fuera)
  3) Mapa check_id → native_code / i18n (sin Bedrock)
  4) Copy amigable: i18n → caché check_id → Bedrock (desconocidos / genéricos, tope N, dedupe)
  5) Pricing API + math CPU → Dynamo FINDING#etl# + patch friendly* en findings operativos
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
from dynamodb_writer import (
    patch_operational_findings_friendly,
    put_audit_summary,
    put_enriched_findings,
)
from engine_sources import collect_four_engine_rows, flatten_and_dedupe
from friendly_copy import (
    friendly_from_i18n,
    get_cached_friendly,
    needs_llm_friendly,
    normalize_check_key,
    put_cached_friendly,
)
from i18n_resolver import build_i18n_bundle, resolve_locale_key, resolve_metadata
from models import AggregatorEvent, BilingualFriendly, EnrichedFinding, LlmClassification
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


def _row_check_id(row: dict[str, Any]) -> str:
    return str(
        row.get("checkId")
        or row.get("check_id")
        or row.get("vulnerabilityId")
        or row.get("VulnerabilityID")
        or ""
    ).strip()


def _bedrock_max() -> int:
    try:
        return max(0, int(os.environ.get("ETL_BEDROCK_MAX", "25")))
    except ValueError:
        return 25


def _bedrock_severity_ok(row: dict[str, Any]) -> bool:
    if os.environ.get("ETL_SKIP_BEDROCK", "").lower() in {"1", "true", "yes"}:
        return False
    allowed = {
        s.strip().upper()
        for s in os.environ.get("ETL_BEDROCK_SEVERITIES", "CRITICAL,HIGH,MEDIUM").split(",")
        if s.strip()
    }
    sev = str(row.get("severity") or row.get("Severity") or "MEDIUM").upper()
    return sev in allowed or not allowed


def _resolve_friendly(
    *,
    row: dict[str, Any],
    classified: LlmClassification,
    locale_key: str,
    mapped_ok: bool,
    es_entry: dict[str, str],
    en_entry: dict[str, str],
    metadata: dict[str, Any],
    domain: str,
    memory_cache: dict[str, BilingualFriendly],
    bedrock_budget: list[int],
    stats: dict[str, int],
) -> BilingualFriendly:
    """i18n específico → memoria/Dynamo cache global → Bedrock (dedupe por check_id)."""
    check_key = normalize_check_key(_row_check_id(row) or classified["native_code"])

    def from_dict() -> BilingualFriendly:
        return friendly_from_i18n(
            locale_key=locale_key,
            es=es_entry,  # type: ignore[arg-type]
            en=en_entry,  # type: ignore[arg-type]
            metadata=metadata,  # type: ignore[arg-type]
            domain=domain,
        )

    # 1) Diccionario i18n no genérico
    if not needs_llm_friendly(locale_key, mapped_ok):
        stats["friendlyFromDict"] += 1
        return from_dict()

    # 2) Memoria del run
    if check_key and check_key in memory_cache:
        stats["friendlyFromMemory"] += 1
        return memory_cache[check_key]

    # 3) Caché Dynamo global
    cached = get_cached_friendly(check_key) if check_key else None
    if cached is not None:
        memory_cache[check_key] = cached
        stats["friendlyFromCache"] += 1
        return cached

    # 4) Bedrock (1 llamada por check_id único)
    if (
        _bedrock_severity_ok(row)
        and bedrock_budget[0] > 0
        and bedrock_budget[1] < bedrock_budget[0]
    ):
        try:
            ai = classify_finding_with_bedrock(row)
            bedrock_budget[1] += 1
            time.sleep(0.12)
            if ai is not None:
                if not mapped_ok:
                    classified.update(
                        {
                            "finding_id": ai["finding_id"],
                            "native_code": ai["native_code"],
                            "resource_id": ai.get("resource_id") or classified["resource_id"],
                            "extracted_variables": ai["extracted_variables"],
                        }
                    )
                friendly = ai.get("friendly")
                if friendly:
                    memory_cache[check_key] = friendly
                    put_cached_friendly(check_key, friendly)
                    stats["friendlyFromBedrock"] += 1
                    return friendly
        except Exception:
            bedrock_budget[1] += 1
            logger.warning("bedrock_friendly_failed", exc_info=True)

    # 5) Fallback i18n
    stats["friendlyFallback"] += 1
    return from_dict()


def _enrich_one(
    *,
    tenant_id: str,
    aws_account_id: str,
    audit_id: str,
    raw: dict[str, Any],
    classified: LlmClassification,
    friendly: BilingualFriendly,
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
    # Overlay bilingual friendly onto i18n bundles
    i18n = {
        "es": {
            "explanation": friendly["es"]["headline"],
            "business_impact": friendly["es"]["why"],
        },
        "en": {
            "explanation": friendly["en"]["headline"],
            "business_impact": friendly["en"]["why"],
        },
    }

    domain = _domain_for(classified["finding_id"], classified["native_code"])
    source = str(raw.get("_source_engine") or raw.get("engine") or "unknown")
    title = str(raw.get("title") or raw.get("Title") or raw.get("checkId") or "")
    check_id = _row_check_id(raw) or classified["native_code"]

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
        check_id=check_id,
        friendly=friendly,
    )


def run_pipeline(event: AggregatorEvent) -> dict[str, Any]:
    tenant_id, account_id, audit_id, correlation_id = extract_tenant_ids(event)

    by_engine = collect_four_engine_rows(dict(event))
    engine_counts = {k: len(v) for k, v in by_engine.items()}
    raw_rows = flatten_and_dedupe(by_engine)

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
    # [max, used]
    bedrock_budget = [_bedrock_max(), 0]
    memory_cache: dict[str, BilingualFriendly] = {}
    stats = {
        "friendlyFromDict": 0,
        "friendlyFromMemory": 0,
        "friendlyFromCache": 0,
        "friendlyFromBedrock": 0,
        "friendlyFallback": 0,
        "mappedWithoutBedrock": 0,
        "ignored": 0,
        "rowErrors": 0,
    }

    enriched: list[EnrichedFinding] = []

    for row in filtered:
        try:
            classified, mapped_ok = map_row_to_classification(row)
            if classified is None:
                stats["ignored"] += 1
                continue

            locale_key = resolve_locale_key(
                classified["native_code"], classified["finding_id"]
            )
            metadata = resolve_metadata(locale_key)
            domain = _domain_for(classified["finding_id"], classified["native_code"])

            # i18n preliminar (savings 0) solo para armar fallback de copy
            prelim_i18n = build_i18n_bundle(locale_key, classified["extracted_variables"], 0.0)

            friendly = _resolve_friendly(
                row=row,
                classified=classified,
                locale_key=locale_key,
                mapped_ok=mapped_ok,
                es_entry=prelim_i18n["es"],
                en_entry=prelim_i18n["en"],
                metadata=metadata,
                domain=domain,
                memory_cache=memory_cache,
                bedrock_budget=bedrock_budget,
                stats=stats,
            )

            # Si Bedrock reclasificó, refrescar locale
            locale_key = resolve_locale_key(
                classified["native_code"], classified["finding_id"]
            )

            if mapped_ok and not needs_llm_friendly(locale_key, mapped_ok):
                stats["mappedWithoutBedrock"] += 1

            enriched.append(
                _enrich_one(
                    tenant_id=tenant_id,
                    aws_account_id=account_id,
                    audit_id=audit_id,
                    raw=row,
                    classified=classified,
                    friendly=friendly,
                )
            )
        except Exception:
            stats["rowErrors"] += 1
            logger.exception("row_pipeline_failed")

    total_savings = sum(f.calculated_savings_usd for f in enriched)
    critical = sum(1 for f in enriched if f.metadata["severity"] == "CRITICAL")

    written = 0
    patched = 0
    if not dry_run and enriched:
        written = put_enriched_findings(enriched)
        try:
            patched = patch_operational_findings_friendly(
                tenant_id=tenant_id,
                audit_id=audit_id,
                enriched=enriched,
            )
        except Exception:
            logger.exception("patch_operational_friendly_failed")
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
        "mappedWithoutBedrock": stats["mappedWithoutBedrock"],
        "bedrockClassified": stats["friendlyFromBedrock"],
        "bedrockBudgetUsed": bedrock_budget[1],
        "friendlyFromDict": stats["friendlyFromDict"],
        "friendlyFromMemory": stats["friendlyFromMemory"],
        "friendlyFromCache": stats["friendlyFromCache"],
        "friendlyFromBedrock": stats["friendlyFromBedrock"],
        "friendlyFallback": stats["friendlyFallback"],
        "ignored": stats["ignored"],
        "rowErrors": stats["rowErrors"],
        "criticalCount": critical,
        "CalculatedSavingsNumeric": round(total_savings, 4),
        "dynamoWritten": written,
        "operationalPatched": patched,
        "dryRun": dry_run,
    }
