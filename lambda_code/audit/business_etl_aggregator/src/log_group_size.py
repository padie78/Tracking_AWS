"""
Enriquece findings de retención infinita con storedBytes reales
vía AssumeRole + logs:DescribeLogGroups en la cuenta cliente.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

_BYTES_PER_GIB = 1024**3
_LOG_RETENTION_RE = re.compile(
    r"cloudwatch.*retention|log_group.*retention|infinite_retention",
    re.I,
)
_ARN_LOG_GROUP_RE = re.compile(
    r"arn:aws:logs:([a-z0-9-]+):\d+:log-group:([^:*]+)",
    re.I,
)


def _is_log_retention_row(row: dict[str, Any]) -> bool:
    blob = " ".join(
        str(row.get(k) or "")
        for k in ("checkId", "check_id", "title", "category", "native_code")
    )
    return bool(_LOG_RETENTION_RE.search(blob))


def _resource_id(row: dict[str, Any]) -> str:
    for k in (
        "resourceId",
        "resource_id",
        "resourceArn",
        "resourceUid",
        "uid",
        "name",
        "id",
    ):
        v = row.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _parse_log_group_ref(resource: str) -> tuple[str | None, str | None]:
    """Devuelve (region|None, logGroupName|None) desde ARN o nombre plano."""
    raw = (resource or "").strip()
    if not raw or raw == "unknown":
        return None, None
    m = _ARN_LOG_GROUP_RE.search(raw)
    if m:
        return m.group(1), m.group(2)
    # ARN sin captura completa / name:*
    if raw.startswith("arn:aws:logs:"):
        parts = raw.split(":")
        if len(parts) >= 7 and parts[5] == "log-group":
            name = parts[6].split(":")[0]
            return parts[3] or None, name or None
    # Nombre típico de log group
    if raw.startswith("/") or raw.startswith("aws/") or "log" in raw.lower():
        return None, raw.split(":")[0]
    return None, raw


def _row_region(row: dict[str, Any], fallback: str) -> str:
    for k in ("region", "Region", "awsRegion", "AwsRegion"):
        v = row.get(k)
        if v is not None and str(v).strip() and str(v).strip() != "unknown":
            return str(v).strip()
    return fallback


def assume_customer_credentials(
    role_arn: str,
    external_id: str,
    *,
    session_name: str = "track-aws-etl-log-size",
) -> dict[str, str] | None:
    if not role_arn.strip():
        return None
    sts = boto3.client("sts", config=Config(retries={"max_attempts": 3, "mode": "standard"}))
    kwargs: dict[str, Any] = {
        "RoleArn": role_arn.strip(),
        "RoleSessionName": session_name[:64],
        "DurationSeconds": 900,
    }
    if external_id.strip():
        kwargs["ExternalId"] = external_id.strip()
    try:
        resp = sts.assume_role(**kwargs)
    except ClientError:
        logger.exception("assume_role_failed", extra={"roleArn": role_arn})
        return None
    creds = resp.get("Credentials") or {}
    access = creds.get("AccessKeyId")
    secret = creds.get("SecretAccessKey")
    token = creds.get("SessionToken")
    if not access or not secret or not token:
        return None
    return {
        "aws_access_key_id": access,
        "aws_secret_access_key": secret,
        "aws_session_token": token,
    }


def _logs_client(creds: dict[str, str], region: str):  # type: ignore[no-untyped-def]
    return boto3.client(
        "logs",
        region_name=region,
        aws_access_key_id=creds["aws_access_key_id"],
        aws_secret_access_key=creds["aws_secret_access_key"],
        aws_session_token=creds["aws_session_token"],
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


def fetch_stored_bytes(
    creds: dict[str, str],
    region: str,
    log_group_name: str,
    cache: dict[tuple[str, str], int | None],
) -> int | None:
    key = (region, log_group_name)
    if key in cache:
        return cache[key]

    client = _logs_client(creds, region)
    try:
        resp = client.describe_log_groups(
            logGroupNamePrefix=log_group_name,
            limit=50,
        )
    except ClientError:
        logger.warning(
            "describe_log_groups_failed",
            extra={"region": region, "logGroup": log_group_name},
            exc_info=True,
        )
        cache[key] = None
        return None

    stored: int | None = None
    for group in resp.get("logGroups") or []:
        name = str(group.get("logGroupName") or "")
        if name == log_group_name:
            try:
                stored = int(group.get("storedBytes") or 0)
            except (TypeError, ValueError):
                stored = 0
            break

    cache[key] = stored
    return stored


def enrich_rows_with_log_group_sizes(
    rows: list[dict[str, Any]],
    *,
    role_arn: str,
    external_id: str,
    default_region: str = "eu-central-1",
) -> dict[str, int]:
    """
    Mutates matching rows: storedBytes, gb (GiB float), _log_size_resolved.
    Returns counters for observability.
    """
    stats = {"candidates": 0, "resolved": 0, "missing": 0, "assumeFailed": 0}
    targets: list[tuple[dict[str, Any], str, str]] = []

    for row in rows:
        if not _is_log_retention_row(row):
            continue
        # Ya viene telemetría
        if row.get("storedBytes") is not None or row.get("stored_bytes") is not None:
            try:
                raw_b = int(row.get("storedBytes") if row.get("storedBytes") is not None else row.get("stored_bytes"))
            except (TypeError, ValueError):
                raw_b = -1
            if raw_b >= 0:
                row["storedBytes"] = raw_b
                row["gb"] = round(raw_b / _BYTES_PER_GIB, 6)
                row["_log_size_resolved"] = True
                stats["resolved"] += 1
                continue

        resource = _resource_id(row)
        region_hint, name = _parse_log_group_ref(resource)
        if not name:
            stats["missing"] += 1
            continue
        region = region_hint or _row_region(row, default_region)
        stats["candidates"] += 1
        targets.append((row, region, name))

    if not targets:
        return stats

    creds = assume_customer_credentials(role_arn, external_id)
    if not creds:
        stats["assumeFailed"] = 1
        return stats

    cache: dict[tuple[str, str], int | None] = {}
    for row, region, name in targets:
        stored = fetch_stored_bytes(creds, region, name, cache)
        if stored is None:
            stats["missing"] += 1
            continue
        row["storedBytes"] = stored
        row["gb"] = round(stored / _BYTES_PER_GIB, 6)
        row["region"] = region
        row["_log_size_resolved"] = True
        stats["resolved"] += 1

    logger.info("log_group_size_enrichment", extra=stats)
    return stats
