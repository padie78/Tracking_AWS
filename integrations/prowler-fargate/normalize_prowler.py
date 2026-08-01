#!/usr/bin/env python3
"""Normaliza salida JSON/OCSF de Prowler al schema AuditFinding de Track_AWS."""
from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SEVERITY_MAP = {
    "Critical": "CRITICAL",
    "critical": "CRITICAL",
    "High": "HIGH",
    "high": "HIGH",
    "Medium": "MEDIUM",
    "medium": "MEDIUM",
    "Low": "LOW",
    "low": "LOW",
    "Informational": "INFO",
    "Info": "INFO",
    "info": "INFO",
}


def map_severity(raw: Any) -> str:
    if raw is None:
        return "MEDIUM"
    if isinstance(raw, dict):
        raw = raw.get("Label") or raw.get("label") or raw.get("value")
    return SEVERITY_MAP.get(str(raw), "MEDIUM")


def framework_from(check: dict[str, Any]) -> str:
    for key in ("compliance", "Compliance", "framework", "Framework"):
        val = check.get(key)
        if isinstance(val, list) and val:
            first = val[0]
            if isinstance(first, dict):
                return str(first.get("Framework") or first.get("Id") or "cis")
            return str(first)
        if isinstance(val, str) and val:
            return val
    return "cis"


def iter_checks(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("findings", "Findings", "data", "Data"):
            if isinstance(payload.get(key), list):
                return [x for x in payload[key] if isinstance(x, dict)]
        return [payload]
    return []


def is_fail(check: dict[str, Any]) -> bool:
    status = str(
        check.get("Status") or check.get("status") or check.get("StatusCode") or ""
    ).upper()
    if "PASS" in status or status in {"OK"}:
        return False
    if status in {"FAIL", "FAILED", "ALERT"}:
        return True
    # OCSF / mixed: incluir si severity es HIGH+ o no hay status PASS
    severity = map_severity(
        check.get("Severity") or check.get("severity") or check.get("severity_id")
    )
    if severity in {"CRITICAL", "HIGH", "MEDIUM"}:
        return "PASS" not in status
    return False


def to_finding(
    check: dict[str, Any],
    *,
    tenant_id: str,
    audit_id: str,
    account_id: str,
    now: str,
) -> dict[str, Any] | None:
    if not is_fail(check):
        return None

    finding_info = check.get("finding_info")
    title = (
        check.get("CheckTitle")
        or check.get("title")
        or (finding_info.get("title") if isinstance(finding_info, dict) else None)
        or check.get("message")
        or check.get("StatusExtended")
        or "Prowler finding"
    )

    metadata = check.get("metadata") if isinstance(check.get("metadata"), dict) else {}
    check_id = (
        check.get("CheckID")
        or check.get("check_id")
        or (finding_info.get("uid") if isinstance(finding_info, dict) else None)
        or metadata.get("event_code")
        or "prowler.check"
    )

    resources = check.get("resources")
    resource_from_list = None
    if isinstance(resources, list) and resources and isinstance(resources[0], dict):
        resource_from_list = resources[0].get("uid")

    resource = (
        check.get("ResourceArn")
        or check.get("resource_uid")
        or resource_from_list
        or check.get("ResourceId")
        or f"arn:aws:iam::{account_id}:root"
    )
    resource_id = str(
        check.get("ResourceId")
        or check.get("resource_name")
        or str(resource).split("/")[-1]
        or account_id
    )
    region = str(check.get("Region") or check.get("region") or "global")
    severity = map_severity(
        check.get("Severity") or check.get("severity") or check.get("severity_id")
    )
    rationale = str(
        check.get("StatusExtended")
        or check.get("message")
        or (finding_info.get("desc") if isinstance(finding_info, dict) else None)
        or check.get("Description")
        or title
    )
    remediation_obj = check.get("Remediation")
    remediation = "Revisar remediación en documentación CIS / AWS Security Hub."
    if isinstance(remediation_obj, dict):
        recommendation = remediation_obj.get("Recommendation")
        if isinstance(recommendation, dict) and recommendation.get("Text"):
            remediation = str(recommendation["Text"])
    elif isinstance(check.get("remediation"), str):
        remediation = str(check["remediation"])

    return {
        "findingId": str(uuid.uuid4()),
        "domain": "secops",
        "category": framework_from(check),
        "severity": severity,
        "resourceArn": str(resource),
        "resourceId": resource_id,
        "region": region,
        "title": str(title)[:240],
        "rationale": rationale[:2000],
        "recommendedAction": remediation[:2000],
        "estimatedMonthlySavingsUsd": 0,
        "checkId": str(check_id)[:128],
        "createdAtIso": now,
        "tenantId": tenant_id,
        "auditId": audit_id,
    }


def load_json_files(work_dir: Path) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for path in sorted(work_dir.rglob("*.json")):
        if path.name == "findings.json":
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        findings.extend(iter_checks(payload))
    return findings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--audit-id", required=True)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    raw = load_json_files(Path(args.work_dir))
    normalized: list[dict[str, Any]] = []
    for check in raw:
        item = to_finding(
            check,
            tenant_id=args.tenant_id,
            audit_id=args.audit_id,
            account_id=args.account_id,
            now=now,
        )
        if item:
            normalized.append(item)

    normalized = normalized[:500]
    out = {
        "findings": normalized,
        "engine": "prowler-fargate",
        "rawCheckCount": len(raw),
        "findingCount": len(normalized),
    }
    Path(args.out).write_text(json.dumps(out), encoding="utf-8")
    print(f"[normalize] raw={len(raw)} findings={len(normalized)} → {args.out}")


if __name__ == "__main__":
    main()
