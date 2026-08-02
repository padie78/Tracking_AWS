#!/usr/bin/env python3
"""Normaliza salida JSON de Trivy al schema AuditFinding / AppSec de Track_AWS."""
from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SEVERITY_MAP = {
    "CRITICAL": "CRITICAL",
    "HIGH": "HIGH",
    "MEDIUM": "MEDIUM",
    "LOW": "LOW",
    "UNKNOWN": "INFO",
}


def map_severity(raw: Any) -> str:
    return SEVERITY_MAP.get(str(raw or "MEDIUM").upper(), "MEDIUM")


def iter_vulns(payload: Any) -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    if not isinstance(payload, dict):
        return out
    target = str(payload.get("ArtifactName") or payload.get("Target") or "image")
    for result in payload.get("Results") or []:
        if not isinstance(result, dict):
            continue
        tgt = str(result.get("Target") or target)
        for vuln in result.get("Vulnerabilities") or []:
            if isinstance(vuln, dict):
                out.append((tgt, vuln))
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--audit-id", required=True)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    work = Path(args.work_dir)
    findings: list[dict[str, Any]] = []

    for path in sorted(work.glob("trivy-*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for target, vuln in iter_vulns(payload):
            vid = str(vuln.get("VulnerabilityID") or "CVE-UNKNOWN")
            pkg = str(vuln.get("PkgName") or vuln.get("PackageName") or "pkg")
            severity = map_severity(vuln.get("Severity"))
            title = f"{vid} en {pkg} ({target})"
            findings.append(
                {
                    "findingId": str(uuid.uuid4()),
                    "domain": "secops",
                    "category": "appsec",
                    "severity": severity,
                    "resourceArn": target,
                    "resourceId": pkg,
                    "region": "global",
                    "title": title[:240],
                    "rationale": str(vuln.get("Description") or vuln.get("Title") or title)[:2000],
                    "recommendedAction": str(
                        vuln.get("FixedVersion")
                        and f"Actualizar {pkg} a {vuln.get('FixedVersion')}"
                        or "Remediar vulnerabilidad según advisory del vendor."
                    )[:2000],
                    "estimatedMonthlySavingsUsd": 0,
                    "checkId": vid[:128],
                    "createdAtIso": now,
                    "tenantId": args.tenant_id,
                    "auditId": args.audit_id,
                    # columnas extras para Parquet Trivy
                    "target": target,
                    "vulnerabilityId": vid,
                    "pkgName": pkg,
                    "installedVersion": str(vuln.get("InstalledVersion") or ""),
                    "fixedVersion": str(vuln.get("FixedVersion") or ""),
                }
            )

    findings = findings[:500]
    out = {
        "findings": findings,
        "engine": "trivy-fargate",
        "findingCount": len(findings),
    }
    Path(args.out).write_text(json.dumps(out), encoding="utf-8")
    print(f"[normalize-trivy] findings={len(findings)} → {args.out}")


if __name__ == "__main__":
    main()
