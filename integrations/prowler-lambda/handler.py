"""
AWS Lambda handler — Prowler (container image oficial).
Recibe AuditPayload desde Step Functions, asume rol, corre prowler, retorna findings.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import boto3

from normalize_prowler import load_json_files, to_finding
from datetime import datetime, timezone


def _assume_role(role_arn: str, external_id: str, session_name: str) -> dict[str, str]:
    sts = boto3.client("sts")
    assumed = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName=session_name[:64],
        ExternalId=external_id,
        DurationSeconds=3600,
    )
    creds = assumed["Credentials"]
    return {
        "AWS_ACCESS_KEY_ID": creds["AccessKeyId"],
        "AWS_SECRET_ACCESS_KEY": creds["SecretAccessKey"],
        "AWS_SESSION_TOKEN": creds["SessionToken"],
    }


def _run_prowler(regions: list[str], work_dir: Path, env: dict[str, str]) -> int:
    cmd = [
        "prowler",
        "aws",
        "-M",
        "json-ocsf",
        "-o",
        str(work_dir),
        "--ignore-exit-code-3",
    ]
    for region in regions:
        cmd.extend(["--region", region])

    proc = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    (work_dir / "prowler.stdout.log").write_text(proc.stdout or "", encoding="utf-8")
    (work_dir / "prowler.stderr.log").write_text(proc.stderr or "", encoding="utf-8")
    return proc.returncode


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    tenant_id = str(event["tenantId"])
    audit_id = str(event["auditId"])
    account_id = str(event["accountId"])
    role_arn = str(event["roleArn"])
    external_id = str(event["externalId"])
    regions = event.get("regions") or ["us-east-1"]
    if isinstance(regions, str):
        regions = [r.strip() for r in regions.split(",") if r.strip()]

    session_name = f"prowler-{audit_id}"[:64]
    assumed_env = os.environ.copy()
    assumed_env.update(_assume_role(role_arn, external_id, session_name))
    # Evitar que el SDK use el rol de la Lambda tras AssumeRole
    assumed_env.pop("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", None)
    assumed_env.pop("AWS_CONTAINER_CREDENTIALS_FULL_URI", None)

    work_dir = Path(tempfile.mkdtemp(prefix="prowler-", dir="/tmp"))
    rc = _run_prowler(list(regions), work_dir, assumed_env)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    raw = load_json_files(work_dir)
    findings: list[dict[str, Any]] = []
    for check in raw:
        item = to_finding(
            check,
            tenant_id=tenant_id,
            audit_id=audit_id,
            account_id=account_id,
            now=now,
        )
        if item:
            findings.append(item)
    findings = findings[:500]

    # Persistencia opcional en S3 (artefacto / debug); respuesta SFN es la fuente
    bucket = os.environ.get("OUTPUT_BUCKET") or os.environ.get("PROWLER_FINDINGS_BUCKET")
    if bucket:
        key = f"tenants/{tenant_id}/audits/{audit_id}/prowler/findings.json"
        body = json.dumps(
            {
                "findings": findings,
                "engine": "prowler-lambda",
                "prowlerExitCode": rc,
                "rawCheckCount": len(raw),
                "findingCount": len(findings),
            }
        )
        boto3.client("s3").put_object(
            Bucket=bucket,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType="application/json",
            ServerSideEncryption="AES256",
        )

    return {
        "findings": findings,
        "engine": "prowler-lambda",
        "prowlerExitCode": rc,
        "rawCheckCount": len(raw),
        "findingCount": len(findings),
    }
