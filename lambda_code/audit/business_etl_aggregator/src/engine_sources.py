"""
Carga de artefactos del scanner:
  - cloudquery (finops.findings + resources tips)
  - prowler   (secops S3 JSON o inline)
  - trivy     (appsec S3 JSON o inline)
  - infracost (finops.infracostLines)
  - komiser   (inventario financiero S3 → findings de costo)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import boto3

logger = logging.getLogger(__name__)

EngineName = str  # cloudquery | prowler | trivy | infracost | komiser

# Umbral mínimo USD/mes para materializar finding Komiser (evita ruido 1e-8)
KOMISER_MIN_COST_USD = float(os.environ.get("KOMISER_MIN_COST_USD", "0.01"))
# Tope de findings Komiser por audit (prioriza mayor |cost|)
KOMISER_MAX_FINDINGS = int(os.environ.get("KOMISER_MAX_FINDINGS", "200"))


def _s3_client():  # type: ignore[no-untyped-def]
    return boto3.client("s3")


def load_json_from_s3(bucket: str, key: str) -> Any:
    obj = _s3_client().get_object(Bucket=bucket, Key=key)
    return json.loads(obj["Body"].read())


def _tag(row: dict[str, Any], engine: EngineName) -> dict[str, Any]:
    out = dict(row)
    out["_source_engine"] = engine
    return out


def _as_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [x for x in value if isinstance(x, dict)]


def _resolve_bucket_key(
    engine_payload: dict[str, Any],
    *,
    tenant_id: str,
    audit_id: str,
    default_key: str,
) -> tuple[str | None, str | None]:
    bucket = (
        engine_payload.get("sourceBucket")
        or os.environ.get("PROWLER_FINDINGS_BUCKET")
        or os.environ.get("ARTIFACTS_BUCKET")
    )
    key = engine_payload.get("sourceKey") or (
        f"tenants/{tenant_id}/audits/{audit_id}/{default_key}"
        if tenant_id and audit_id
        else None
    )
    return (str(bucket) if bucket else None, str(key) if key else None)


def _load_engine_ref(
    engine_payload: dict[str, Any] | None,
    *,
    engine: EngineName,
    tenant_id: str,
    audit_id: str,
    default_key: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not isinstance(engine_payload, dict):
        return rows

    for r in _as_list(engine_payload.get("findings")):
        rows.append(_tag(r, engine))

    bucket, key = _resolve_bucket_key(
        engine_payload, tenant_id=tenant_id, audit_id=audit_id, default_key=default_key
    )
    if bucket and key and not rows:
        try:
            payload = load_json_from_s3(str(bucket), str(key))
            findings = payload.get("findings") if isinstance(payload, dict) else payload
            for r in _as_list(findings):
                rows.append(_tag(r, engine))
            logger.info(
                "engine_s3_loaded",
                extra={"engine": engine, "bucket": bucket, "key": key, "count": len(rows)},
            )
        except Exception:
            logger.exception(
                "engine_s3_failed",
                extra={"engine": engine, "bucket": bucket, "key": key},
            )
    return rows


def _infracost_to_rows(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normaliza líneas Infracost a filas accionables de costo."""
    rows: list[dict[str, Any]] = []
    for line in lines:
        monthly = float(
            line.get("monthlyCost")
            or line.get("estimatedMonthlyCostUsd")
            or line.get("cost")
            or 0
        )
        if monthly <= 0 and not line.get("resourceId"):
            continue
        rows.append(
            _tag(
                {
                    "engine": "infracost",
                    "status": "FAIL",
                    "severity": "MEDIUM" if monthly < 50 else "HIGH",
                    "category": "infracost",
                    "domain": "finops",
                    "title": str(
                        line.get("title")
                        or line.get("description")
                        or line.get("resourceName")
                        or "Línea de costo Infracost"
                    ),
                    "checkId": str(
                        line.get("checkId")
                        or line.get("resourceType")
                        or "infracost_line"
                    ),
                    "resourceId": str(
                        line.get("resourceId")
                        or line.get("resourceArn")
                        or line.get("address")
                        or "unknown"
                    ),
                    "region": str(line.get("region") or "unknown"),
                    "instance_type": str(
                        line.get("instanceType") or line.get("instance_type") or "unknown"
                    ),
                    "gb": float(line.get("gb") or line.get("sizeGb") or line.get("size_gb") or 0),
                    "volume_type": str(
                        line.get("volumeType") or line.get("volume_type") or "unknown"
                    ),
                    "estimatedMonthlySavingsUsd": monthly,
                    "rationale": str(
                        line.get("rationale")
                        or f"Costo estimado ~USD {monthly:.2f}/mes según Infracost."
                    ),
                    "recommendedAction": str(
                        line.get("recommendedAction")
                        or "Revisá rightsizing o eliminación si el recurso no aporta valor."
                    ),
                },
                "infracost",
            )
        )
    return rows


def _komiser_to_rows(resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Inventario Komiser → findings FinOps accionables.
    Filtra placeholders OLD_RESOURCE_* y costos por debajo del umbral.
    """
    candidates: list[tuple[float, dict[str, Any]]] = []
    for raw in resources:
        rid = str(raw.get("resourceId") or "").strip()
        name = str(raw.get("name") or "").strip()
        if not rid and not name:
            continue
        if rid.startswith("OLD_RESOURCE_") or rid.startswith("OLD_"):
            continue
        try:
            cost = float(raw.get("cost") or 0)
        except (TypeError, ValueError):
            cost = 0.0
        if abs(cost) < KOMISER_MIN_COST_USD:
            continue

        service = str(raw.get("service") or "AWS").strip() or "AWS"
        region = str(raw.get("region") or "unknown").strip() or "unknown"
        display = name or rid
        monthly = abs(cost)
        sev = "HIGH" if monthly >= 50 else "MEDIUM" if monthly >= 5 else "LOW"
        check = f"komiser-{service.lower().replace(' ', '-')}-cost"
        candidates.append(
            (
                monthly,
                _tag(
                    {
                        "engine": "komiser",
                        "status": "FAIL",
                        "severity": sev,
                        "category": "COST_GENERIC_ALERT",
                        "domain": "finops",
                        "title": f"Gasto detectado en {service}: {display}",
                        "checkId": check,
                        "resourceId": rid or display,
                        "resourceArn": rid if rid.startswith("arn:") else "",
                        "region": region,
                        "estimatedMonthlySavingsUsd": round(monthly, 4),
                        "rationale": (
                            f"Komiser reporta ~USD {monthly:.4f}/mes en {service} "
                            f"({region}). Revisá si el recurso aporta valor o se puede "
                            f"optimizar/apagar."
                        ),
                        "recommendedAction": (
                            "Revisá el recurso en la consola AWS, validá owners/tags y "
                            "aplicá rightsizing, scheduling o eliminación si está idle."
                        ),
                        "consoleUrl": str(raw.get("link") or ""),
                        "provider": str(raw.get("provider") or "AWS"),
                        "service": service,
                    },
                    "komiser",
                ),
            )
        )

    candidates.sort(key=lambda x: x[0], reverse=True)
    capped = candidates[: max(0, KOMISER_MAX_FINDINGS)]
    return [row for _, row in capped]


def _load_komiser_ref(
    engine_payload: dict[str, Any] | None,
    *,
    tenant_id: str,
    audit_id: str,
) -> list[dict[str, Any]]:
    if not isinstance(engine_payload, dict):
        engine_payload = {}

    resources = _as_list(engine_payload.get("resources"))
    if not resources:
        bucket, key = _resolve_bucket_key(
            engine_payload,
            tenant_id=tenant_id,
            audit_id=audit_id,
            default_key="komiser/findings.json",
        )
        if bucket and key:
            try:
                payload = load_json_from_s3(bucket, key)
                if isinstance(payload, dict):
                    resources = _as_list(payload.get("resources"))
                elif isinstance(payload, list):
                    resources = _as_list(payload)
                logger.info(
                    "engine_s3_loaded",
                    extra={
                        "engine": "komiser",
                        "bucket": bucket,
                        "key": key,
                        "count": len(resources),
                    },
                )
            except Exception:
                logger.exception(
                    "engine_s3_failed",
                    extra={"engine": "komiser", "bucket": bucket, "key": key},
                )
                return []

    rows = _komiser_to_rows(resources)
    logger.info(
        "komiser_rows_materialized",
        extra={"raw": len(resources), "kept": len(rows)},
    )
    return rows


def collect_four_engine_rows(event: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """
    Devuelve filas por motor. Dedup global se hace después en el orquestador.
    """
    tenant_id = str(event.get("TenantId") or event.get("tenantId") or "")
    audit_id = str(event.get("auditId") or "")

    finops = event.get("finops") if isinstance(event.get("finops"), dict) else {}
    secops = event.get("secops") if isinstance(event.get("secops"), dict) else {}
    appsec = event.get("appsec") if isinstance(event.get("appsec"), dict) else {}
    komiser = event.get("komiser") if isinstance(event.get("komiser"), dict) else {}

    cloudquery_rows = [
        _tag(r, "cloudquery") for r in _as_list(finops.get("findings"))
    ]

    prowler_rows = _load_engine_ref(
        secops,
        engine="prowler",
        tenant_id=tenant_id,
        audit_id=audit_id,
        default_key="prowler/findings.json",
    )

    trivy_rows = _load_engine_ref(
        appsec,
        engine="trivy",
        tenant_id=tenant_id,
        audit_id=audit_id,
        default_key="trivy/findings.json",
    )

    infracost_lines = _as_list(finops.get("infracostLines"))
    infracost_rows = _infracost_to_rows(infracost_lines)

    komiser_rows = _load_komiser_ref(
        komiser,
        tenant_id=tenant_id,
        audit_id=audit_id,
    )

    return {
        "cloudquery": cloudquery_rows,
        "prowler": prowler_rows,
        "trivy": trivy_rows,
        "infracost": infracost_rows,
        "komiser": komiser_rows,
    }


def flatten_and_dedupe(by_engine: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for engine in ("prowler", "trivy", "cloudquery", "infracost", "komiser"):
        for row in by_engine.get(engine, []):
            sig = json.dumps(
                {
                    "e": row.get("_source_engine"),
                    "c": row.get("checkId") or row.get("check_id"),
                    "r": row.get("resourceId")
                    or row.get("resource_id")
                    or row.get("resourceArn"),
                    "t": row.get("title") or row.get("vulnerabilityId"),
                },
                sort_keys=True,
                default=str,
            )
            if sig in seen:
                continue
            seen.add(sig)
            out.append(row)
    return out
