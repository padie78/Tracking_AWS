#!/usr/bin/env python3
"""Smoke test local sin AWS (ETL_SKIP_BEDROCK + ETL_DRY_RUN)."""

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
        "raw_findings": [
            {
                "status": "PASS",
                "check_id": "s3_ok",
                "title": "should be filtered",
            },
            {
                "status": "FAIL",
                "check_id": "iam_user_mfa_enabled_console",
                "resource_id": "alice",
                "region": "eu-central-1",
                "title": "User without MFA",
            },
            {
                "status": "FAIL",
                "engine": "cloudquery",
                "finding": "unattached_ebs",
                "resource_id": "vol-0abc",
                "region": "us-east-1",
                "size_gb": 100,
                "volume_type": "gp3",
                "title": "Unattached EBS",
            },
            {
                "status": "FAIL",
                "vulnerabilityId": "CVE-2024-1234",
                "target": "app:latest",
                "severity": "HIGH",
            },
        ],
    }
    result = lambda_handler(event, None)
    print(json.dumps(result, indent=2))
    assert result["ok"] is True
    assert result["filteredCount"] >= 3
    assert result["enrichedCount"] >= 2
    print("SMOKE_OK")


if __name__ == "__main__":
    main()
