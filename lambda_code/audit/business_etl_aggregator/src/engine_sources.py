"""
Carga de los 4 artefactos del scanner:
  - cloudquery (finops.findings + resources tips)
  - prowler   (secops S3 JSON o inline)
  - trivy     (appsec S3 JSON o inline)
  - infracost (finops.infracostLines)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import boto3

logger = logging.getLogger(__name__)

EngineName = str  # cloudquery | prowler | trivy | infracost


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
    # Si ya hay inline, no hace falta S3 (evita doble carga). Si no, baja el JSON.
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
        # Solo líneas con costo material
        if monthly <= 0 and not line.get("resourceId"):
            continue
        rows.append(
            _tag(
                {
                    "engine": "infracost",
                    "status": "FAIL",
                    "severity": "MEDIUM" if monthly < 50 else "HIGH",
                    "category": "infracost",
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
                    "gb": int(line.get("gb") or line.get("sizeGb") or line.get("size_gb") or 0),
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


def collect_four_engine_rows(event: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """
    Devuelve filas por motor. Dedup global se hace después en el orquestador.
    """
    tenant_id = str(event.get("TenantId") or event.get("tenantId") or "")
    audit_id = str(event.get("auditId") or "")

    finops = event.get("finops") if isinstance(event.get("finops"), dict) else {}
    secops = event.get("secops") if isinstance(event.get("secops"), dict) else {}
    appsec = event.get("appsec") if isinstance(event.get("appsec"), dict) else {}

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

    return {
        "cloudquery": cloudquery_rows,
        "prowler": prowler_rows,
        "trivy": trivy_rows,
        "infracost": infracost_rows,
    }


def flatten_and_dedupe(by_engine: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for engine in ("prowler", "trivy", "cloudquery", "infracost"):
        for row in by_engine.get(engine, []):
            sig = json.dumps(
                {
                    "e": row.get("_source_engine"),
                    "c": row.get("checkId") or row.get("check_id"),
                    "r": row.get("resourceId") or row.get("resource_id") or row.get("resourceArn"),
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
