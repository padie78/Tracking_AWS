#!/usr/bin/env python3
"""Smoke test: 4 motores → filtro → mapa (sin Bedrock) → dry-run."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

os.environ["ETL_SKIP_BEDROCK"] = "true"
os.environ["ETL_DRY_RUN"] = "true"

from handler import lambda_handler  # noqa: E402


def main() -> None:
    event = {
        "TenantId": "demo",
        "AwsAccountId": "473959757331",
        "auditId": "00000000-0000-4000-8000-000000000001",
        "correlationId": "smoke",
        "finops": {
            "findings": [
                {
                    "status": "FAIL",
                    "domain": "finops",
                    "category": "orphaned",
                    "severity": "MEDIUM",
                    "checkId": "ebs_volume_unattached",
                    "title": "EBS no adjunto (100 GiB)",
                    "resourceId": "vol-0abc",
                    "region": "us-east-1",
                    "sizeGb": 100,
                    "volumeType": "gp3",
                    "estimatedMonthlySavingsUsd": 8,
                },
                {
                    "status": "PASS",
                    "checkId": "should_drop",
                    "title": "noise",
                },
            ],
            "infracostLines": [
                {
                    "resourceId": "i-0123",
                    "region": "eu-west-1",
                    "instanceType": "m5.xlarge",
                    "monthlyCost": 120,
                    "title": "EC2 m5.xlarge",
                }
            ],
        },
        "secops": {
            "findings": [
                {
                    "status": "FAIL",
                    "severity": "HIGH",
                    "checkId": "iam_user_mfa_enabled",
                    "title": "User without MFA",
                    "resourceId": "alice",
                    "region": "eu-central-1",
                },
                {
                    "status": "FAIL",
                    "severity": "CRITICAL",
                    "checkId": "ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_22",
                    "title": "SSH open",
                    "resourceId": "sg-123",
                    "region": "eu-central-1",
                },
            ]
        },
        "appsec": {
            "findings": [
                {
                    "severity": "HIGH",
                    "vulnerabilityId": "CVE-2024-1234",
                    "pkgName": "openssl",
                    "target": "app:latest",
                    "title": "CVE in openssl",
                }
            ]
        },
    }
    result = lambda_handler(event, None)
    print(json.dumps(result, indent=2))
    assert result["ok"] is True
    assert result["engineCounts"]["prowler"] >= 2
    assert result["engineCounts"]["trivy"] >= 1
    assert result["engineCounts"]["cloudquery"] >= 1
    assert result["engineCounts"]["infracost"] >= 1
    assert result["enrichedCount"] >= 4
    assert result["bedrockClassified"] == 0
    assert result["mappedWithoutBedrock"] >= 4
    assert result["friendlyFromDict"] >= 4
    print("SMOKE_OK")


if __name__ == "__main__":
    main()
