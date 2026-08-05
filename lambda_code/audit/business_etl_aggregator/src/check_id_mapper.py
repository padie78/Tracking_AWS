"""
Mapa check_id / señales → contrato LLM (sin llamar a Bedrock).
Cubre Prowler CIS, CloudQuery FinOps, Trivy CVE e Infracost.
"""

from __future__ import annotations

import re
from typing import Any

from models import ExtractedVariables, LlmClassification

# check_id substring / regex → (finding_id macro, native_code)
_CHECK_MAP: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"iam_user_mfa|mfa_enabled|user_mfa", re.I), "SEC_IAM_HARDENING", "aws_iam_user_mfa_enabled"),
    (re.compile(r"root_mfa|iam_root", re.I), "SEC_IAM_HARDENING", "aws_iam_user_mfa_enabled"),
    (
        re.compile(r"unused_credential|access_key_.*90|credential.*90", re.I),
        "SEC_IAM_HARDENING",
        "iam_user_unused_credentials_90_days",
    ),
    (
        re.compile(r"ssh|port_22|tcp_port_22|ingress_from_internet_to_tcp_port_22", re.I),
        "SEC_NETWORK_EXPOSED",
        "aws_security_group_ssh_open",
    ),
    (
        re.compile(r"securitygroup_allow_ingress_from_internet|0\.0\.0\.0/0", re.I),
        "SEC_NETWORK_EXPOSED",
        "aws_security_group_ssh_open",
    ),
    (
        re.compile(r"s3_bucket.*public|public_access_block|bucket_level_public", re.I),
        "SEC_SERVERLESS_RISK",
        "SEC_GENERIC_ALERT",
    ),
    (
        re.compile(r"api_gateway|apigateway|no_auth|unauthenticated", re.I),
        "SEC_SERVERLESS_RISK",
        "api_gateway_no_auth",
    ),
    (
        re.compile(r"appsync|graphql.*api.?key|api_key_authentication", re.I),
        "SEC_SERVERLESS_RISK",
        "api_gateway_no_auth",
    ),
    (
        re.compile(
            r"lambda.*public|function_url|lambda_function_not_publicly|awslambda.*invok",
            re.I,
        ),
        "SEC_SERVERLESS_RISK",
        "api_gateway_no_auth",
    ),
    (
        re.compile(
            r"no_secrets_in_code|secrets_in_code|hardcoded.?secret|secret.*in.*code",
            re.I,
        ),
        "SEC_SERVERLESS_RISK",
        "lambda_function_no_secrets_in_code",
    ),
    (
        re.compile(r"secrets?_manager|secret.*encrypt|kms.*secret", re.I),
        "SEC_SERVERLESS_RISK",
        "secrets_manager_secret_unencrypted",
    ),
    (
        re.compile(r"ebs.*unattached|unattached.*ebs|volume.*orphan|orphaned", re.I),
        "COST_EBS_UNUSED",
        "ebs_volume_unattached",
    ),
    (
        re.compile(r"rightsiz|low_util|underutil|sobredimension", re.I),
        "COST_EC2_OVERSIZED",
        "ec2_instance_low_utilization",
    ),
    (
        re.compile(r"cloudwatch.*retention|log_group.*retention|infinite_retention", re.I),
        "COST_SERVERLESS_WASTE",
        "cloudwatch_log_group_infinite_retention",
    ),
    (
        re.compile(r"elastic.?ip|eip.*idle|idle.*eip", re.I),
        "COST_GENERIC_ALERT",
        "COST_GENERIC_ALERT",
    ),
    (re.compile(r"^cve-|vulnerability", re.I), "SEC_VULNERABILITY", "SEC_VULNERABILITY"),
]


def _extract_variables(row: dict[str, Any]) -> ExtractedVariables:
    def _int(*keys: str) -> int:
        for k in keys:
            if row.get(k) is not None:
                try:
                    return max(0, int(row[k]))
                except (TypeError, ValueError):
                    continue
        return 0

    def _str(*keys: str, default: str = "unknown") -> str:
        for k in keys:
            v = row.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return default

    def _gb() -> float:
        for k in ("storedBytes", "stored_bytes", "StoredBytes"):
            if row.get(k) is not None:
                try:
                    return max(0.0, float(row[k]) / float(1024**3))
                except (TypeError, ValueError):
                    continue
        for k in ("gb", "size_gb", "sizeGb", "Size"):
            if row.get(k) is not None:
                try:
                    return max(0.0, float(row[k]))
                except (TypeError, ValueError):
                    continue
        return 0.0

    out: ExtractedVariables = {
        "region": _str("region", "Region"),
        "volume_type": _str("volume_type", "volumeType", "volumeApiName"),
        "gb": round(_gb(), 6),
        "instance_type": _str("instance_type", "instanceType"),
        "retention_days": _int("retention_days", "retentionInDays", "retention"),
    }
    for k in ("storedBytes", "stored_bytes", "StoredBytes"):
        if row.get(k) is not None:
            try:
                out["stored_bytes"] = max(0, int(row[k]))
                break
            except (TypeError, ValueError):
                continue
    if row.get("_log_size_resolved") is True or "stored_bytes" in out:
        out["log_size_resolved"] = True
    return out


def _resource_id(row: dict[str, Any]) -> str:
    for k in (
        "resourceId",
        "resource_id",
        "resourceArn",
        "vulnerabilityId",
        "target",
        "id",
    ):
        v = row.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return "unknown"


def _check_blob(row: dict[str, Any]) -> str:
    return " ".join(
        str(row.get(k) or "")
        for k in (
            "checkId",
            "check_id",
            "title",
            "category",
            "vulnerabilityId",
            "pkgName",
            "rationale",
            "_source_engine",
        )
    )


def map_row_to_classification(row: dict[str, Any]) -> tuple[LlmClassification | None, bool]:
    """
    Returns (classification | None if noise, mapped_from_dictionary).
    mapped_from_dictionary=False → candidato a Bedrock (desconocido).
    """
    engine = str(row.get("_source_engine") or row.get("engine") or "").lower()
    status = str(row.get("status") or row.get("Status") or "").upper()
    if status in {"PASS", "PASSED", "SUCCESS", "OK", "INFO", "INFORMATIONAL"}:
        return None, True

    blob = _check_blob(row)
    variables = _extract_variables(row)
    resource_id = _resource_id(row)

    # Trivy CVE directo
    vuln = row.get("vulnerabilityId") or row.get("VulnerabilityID")
    if vuln or engine == "trivy":
        code = str(vuln or row.get("checkId") or "SEC_VULNERABILITY")
        return (
            {
                "finding_id": "SEC_VULNERABILITY",
                "native_code": code,
                "resource_id": resource_id,
                "extracted_variables": variables,
            },
            True,
        )

    check = str(row.get("checkId") or row.get("check_id") or "")
    hay = f"{check} {blob}"

    for pattern, finding_id, native_code in _CHECK_MAP:
        if pattern.search(hay):
            # native_code especial: usar check original si pedimos GENERIC
            nc = check if native_code == "SEC_GENERIC_ALERT" and check else native_code
            if finding_id == "SEC_VULNERABILITY" and check:
                nc = check
            return (
                {
                    "finding_id": finding_id,
                    "native_code": nc,
                    "resource_id": resource_id,
                    "extracted_variables": variables,
                },
                True,
            )

    # CloudQuery / infracost por categoría de dominio
    domain = str(row.get("domain") or "").lower()
    category = str(row.get("category") or "").lower()
    if domain == "finops" or engine in {"cloudquery", "infracost", "komiser"} or category in {
        "rightsizing",
        "orphaned",
        "modernization",
        "infracost",
        "cost_generic_alert",
    }:
        if "ebs" in hay or "unattached" in hay or category == "orphaned":
            return (
                {
                    "finding_id": "COST_EBS_UNUSED",
                    "native_code": "ebs_volume_unattached",
                    "resource_id": resource_id,
                    "extracted_variables": variables,
                },
                True,
            )
        if "rightsiz" in hay or category == "rightsizing" or "instance" in hay:
            return (
                {
                    "finding_id": "COST_EC2_OVERSIZED",
                    "native_code": "ec2_instance_low_utilization",
                    "resource_id": resource_id,
                    "extracted_variables": variables,
                },
                True,
            )
        return (
            {
                "finding_id": "COST_GENERIC_ALERT",
                "native_code": check or "COST_GENERIC_ALERT",
                "resource_id": resource_id,
                "extracted_variables": variables,
            },
            True,
        )

    # Desconocido → placeholder genérico (Bedrock puede mejorar)
    return (
        {
            "finding_id": "SEC_GENERIC_ALERT",
            "native_code": check or "SEC_GENERIC_ALERT",
            "resource_id": resource_id,
            "extracted_variables": variables,
        },
        False,
    )


def severity_rank(row: dict[str, Any]) -> int:
    sev = str(row.get("severity") or row.get("Severity") or "MEDIUM").upper()
    return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}.get(sev, 2)
