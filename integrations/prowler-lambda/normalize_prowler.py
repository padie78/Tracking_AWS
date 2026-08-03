#!/usr/bin/env python3
"""Normaliza salida JSON/OCSF de Prowler al schema AuditFinding de Track_AWS."""
from __future__ import annotations

import argparse
import json
import re
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


def is_cis_control_id(value: Any) -> bool:
    s = str(value or "").strip()
    return bool(re.fullmatch(r"\d+(\.\d+)+", s))


def humanize_check_id(check_id: str) -> str:
    """prowler-aws-awslambda_function_not_publicly_accessible-… → texto legible."""
    s = check_id.strip()
    s = re.sub(r"^prowler-aws-", "", s, flags=re.I)
    s = re.sub(r"-\d{12}-.*$", "", s)
    s = s.replace("_", " ").replace("-", " ").strip()
    return s[:160] if s else "Prowler finding"


def pick_title(check: dict[str, Any], check_id: str, rationale: str) -> str:
    finding_info = check.get("finding_info")
    candidates = [
        check.get("CheckTitle"),
        check.get("title"),
        finding_info.get("title") if isinstance(finding_info, dict) else None,
        check.get("StatusExtended"),
        check.get("Description"),
        check.get("message"),
        rationale,
        humanize_check_id(check_id),
        "Prowler finding",
    ]
    for c in candidates:
        if not c:
            continue
        text = str(c).strip()
        if not text or is_cis_control_id(text):
            continue
        return text[:240]
    return humanize_check_id(check_id) or "Prowler finding"


def pick_resource(
    check: dict[str, Any], account_id: str
) -> tuple[str, str]:
    """Returns (resourceArn, resourceId) with human-friendly resourceId when possible."""
    resources = check.get("resources")
    resource_from_list = None
    name_from_list = None
    if isinstance(resources, list) and resources and isinstance(resources[0], dict):
        resource_from_list = resources[0].get("uid") or resources[0].get("arn")
        name_from_list = resources[0].get("name") or resources[0].get("uid")

    arn = str(
        check.get("ResourceArn")
        or check.get("resource_uid")
        or resource_from_list
        or check.get("ResourceId")
        or f"arn:aws:iam::{account_id}:root"
    )

    name = (
        check.get("ResourceName")
        or check.get("resource_name")
        or name_from_list
        or check.get("ResourceId")
    )
    name_s = str(name).strip() if name else ""

    # ARN Lambda → function name
    m = re.search(r":function:([^:/]+)", arn)
    if m:
        name_s = m.group(1)
    elif not name_s or name_s == arn or name_s.startswith("arn:"):
        if "/" in arn:
            name_s = arn.rsplit("/", 1)[-1]
        elif ":function:" in arn:
            name_s = arn.split(":function:")[-1].split(":")[0]
        else:
            name_s = arn[-64:] if len(arn) > 64 else arn

    return arn, (name_s or account_id)[:180]


def pick_remediation(check: dict[str, Any]) -> str:
    remediation_obj = check.get("Remediation") or check.get("remediation")
    if isinstance(remediation_obj, dict):
        recommendation = remediation_obj.get("Recommendation") or remediation_obj.get(
            "recommendation"
        )
        if isinstance(recommendation, dict):
            text = recommendation.get("Text") or recommendation.get("text")
            url = recommendation.get("Url") or recommendation.get("url")
            parts = [str(text).strip()] if text else []
            if url:
                parts.append(str(url).strip())
            if parts:
                return " ".join(parts)[:2000]
        code = remediation_obj.get("Code")
        if isinstance(code, dict):
            for key in ("NativeIaC", "Terraform", "CLI", "Other"):
                val = code.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()[:2000]
    elif isinstance(remediation_obj, str) and remediation_obj.strip():
        return remediation_obj.strip()[:2000]

    for key in ("Recommendation", "recommendation", "remediation_text"):
        val = check.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:2000]
    return "Revisar remediación en documentación CIS / AWS Security Hub."


def pick_service(check: dict[str, Any], arn: str) -> str:
    for key in ("ServiceName", "service_name", "service", "Provider"):
        val = check.get(key)
        if isinstance(val, str) and val.strip() and val.strip().lower() not in {
            "aws",
            "prowler",
        }:
            return val.strip().lower()
    m = re.match(r"arn:aws(?:-cn|-us-gov)?:([^:]+):", arn)
    if m:
        return m.group(1).lower()
    return "aws"


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
    metadata = check.get("metadata") if isinstance(check.get("metadata"), dict) else {}
    check_id = str(
        check.get("CheckID")
        or check.get("check_id")
        or (finding_info.get("uid") if isinstance(finding_info, dict) else None)
        or metadata.get("event_code")
        or "prowler.check"
    )[:128]

    arn, resource_id = pick_resource(check, account_id)
    region = str(check.get("Region") or check.get("region") or "global")
    severity = map_severity(
        check.get("Severity") or check.get("severity") or check.get("severity_id")
    )

    rationale = str(
        check.get("StatusExtended")
        or check.get("message")
        or (finding_info.get("desc") if isinstance(finding_info, dict) else None)
        or check.get("Description")
        or check.get("Risk")
        or ""
    ).strip()
    if not rationale:
        rationale = humanize_check_id(check_id)

    title = pick_title(check, check_id, rationale)
    # Prefijar servicio si el título no lo menciona (ayuda al front)
    service = pick_service(check, arn)
    if service and service not in {"aws", "iam"} and service.lower() not in title.lower():
        pretty = {
            "lambda": "Lambda",
            "awslambda": "Lambda",
            "s3": "S3",
            "ec2": "EC2",
            "rds": "RDS",
            "appsync": "AppSync",
            "apigateway": "API Gateway",
            "cloudtrail": "CloudTrail",
        }.get(service, service.upper())
        title = f"{pretty}: {title}"[:240]

    framework = framework_from(check)
    # category más útil para filtros SPA (iam/network/storage/…)
    category = service if service not in {"aws"} else framework

    return {
        "findingId": str(uuid.uuid4()),
        "domain": "secops",
        "category": str(category)[:64],
        "severity": severity,
        "resourceArn": arn,
        "resourceId": resource_id,
        "region": region,
        "title": title[:240],
        "rationale": rationale[:2000],
        "recommendedAction": pick_remediation(check),
        "estimatedMonthlySavingsUsd": 0,
        "checkId": check_id,
        "createdAtIso": now,
        "tenantId": tenant_id,
        "auditId": audit_id,
        "awsService": service,
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
