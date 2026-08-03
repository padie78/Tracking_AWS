"""Cliente Bedrock Converse — clasificador fila a fila."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import boto3
from botocore.config import Config

from bedrock_prompt import BEDROCK_MODEL_ID, SYSTEM_PROMPT
from friendly_copy import parse_friendly_from_llm
from models import ExtractedVariables, LlmClassification

logger = logging.getLogger(__name__)

_JSON_RE = re.compile(r"\{[\s\S]*\}")


def _bedrock_client():  # type: ignore[no-untyped-def]
    region = os.environ.get("BEDROCK_REGION", os.environ.get("AWS_REGION", "eu-central-1"))
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


def _default_variables() -> ExtractedVariables:
    return {
        "region": "unknown",
        "volume_type": "unknown",
        "gb": 0,
        "instance_type": "unknown",
        "retention_days": 0,
    }


def _normalize_variables(raw: dict[str, Any] | None) -> ExtractedVariables:
    base = _default_variables()
    if not isinstance(raw, dict):
        return base
    region = str(raw.get("region") or "unknown").strip() or "unknown"
    volume_type = str(raw.get("volume_type") or "unknown").strip() or "unknown"
    instance_type = str(raw.get("instance_type") or "unknown").strip() or "unknown"
    try:
        gb = int(raw.get("gb") or 0)
    except (TypeError, ValueError):
        gb = 0
    try:
        retention_days = int(raw.get("retention_days") or 0)
    except (TypeError, ValueError):
        retention_days = 0
    return {
        "region": region,
        "volume_type": volume_type,
        "gb": max(0, gb),
        "instance_type": instance_type,
        "retention_days": max(0, retention_days),
    }


def _extract_text(converse_response: dict[str, Any]) -> str:
    output = converse_response.get("output") or {}
    message = output.get("message") or {}
    parts: list[str] = []
    for block in message.get("content") or []:
        text = block.get("text")
        if isinstance(text, str):
            parts.append(text)
    return "\n".join(parts).strip()


def classify_finding_with_bedrock(raw_row: dict[str, Any]) -> LlmClassification | None:
    """
    Invoca Claude Haiku. Devuelve clasificación o None si IGNORAR / parse fallido.
    El LLM nunca calcula dinero; solo variables físicas.
    """
    model_id = os.environ.get("BEDROCK_MODEL_ID", BEDROCK_MODEL_ID)
    user_payload = json.dumps(raw_row, ensure_ascii=False, default=str)

    client = _bedrock_client()
    response = client.converse(
        modelId=model_id,
        system=[{"text": SYSTEM_PROMPT}],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "text": (
                            "Clasificá el siguiente hallazgo según el contrato. "
                            f"Hallazgo:\n{user_payload}"
                        )
                    }
                ],
            }
        ],
        inferenceConfig={"maxTokens": 768, "temperature": 0},
    )

    text = _extract_text(response)
    if not text:
        logger.warning("bedrock_empty_response")
        return None

    cleaned = text.strip()
    if cleaned.upper() == "IGNORAR" or cleaned.upper().startswith("IGNORAR"):
        return None

    match = _JSON_RE.search(cleaned)
    if not match:
        logger.warning("bedrock_non_json", extra={"preview": cleaned[:200]})
        return None

    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        logger.warning("bedrock_json_decode_error", extra={"preview": cleaned[:200]})
        return None

    if not isinstance(data, dict):
        return None

    finding_id = str(data.get("finding_id") or "").strip()
    native_code = str(data.get("native_code") or "").strip()
    resource_id = str(data.get("resource_id") or "unknown").strip() or "unknown"
    if not finding_id or not native_code:
        return None

    out: LlmClassification = {
        "finding_id": finding_id,
        "native_code": native_code,
        "resource_id": resource_id,
        "extracted_variables": _normalize_variables(data.get("extracted_variables")),
    }
    friendly = parse_friendly_from_llm(data)
    if friendly is not None:
        out["friendly"] = friendly
    return out
