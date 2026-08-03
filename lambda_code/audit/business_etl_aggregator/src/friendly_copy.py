"""
Copy amigable ES: diccionario i18n → caché Dynamo por check_id → Bedrock.
"""

from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.config import Config

from models import FriendlyCopy, FindingMetadata, LocaleEntry

logger = logging.getLogger(__name__)

_GENERIC_KEYS = frozenset({"SEC_GENERIC_ALERT", "COST_GENERIC_ALERT"})

_SLUG_ACTIONS: dict[str, str] = {
    "activar-mfa": "Activá MFA para ese usuario desde la consola de IAM (tarda unos minutos).",
    "rotar-credenciales-iam": "Desactivá o borrá las claves que nadie usa hace más de 90 días.",
    "cerrar-puerto-ssh": "Cerrá el puerto 22 al mundo y dejalo solo para tu oficina o VPN.",
    "borrar-ebs-huerfano": "Sacá un respaldo si hace falta y borrá o reconectá el disco.",
    "rightsizing-ec2": "Bajá de tamaño o apagalo fuera de horario laboral.",
    "retenicion-logs": "Definí retención de logs (p. ej. 30–90 días) en el grupo de CloudWatch.",
    "auth-api-gateway": "Agregá login, API keys o un autorizador antes de exponerla.",
    "cifrar-secreto": "Activá cifrado (KMS) y rotá el secreto si estaba expuesto.",
}

_CHECK_ID_RE = re.compile(r"[^a-z0-9._-]+", re.I)


def normalize_check_key(raw: str | None) -> str:
    s = (raw or "").strip().lower()
    if not s:
        return ""
    # Quitar sufijos de cuenta/región típicos de Prowler
    s = re.sub(r"-\d{12}-[a-z0-9-]+-[a-z0-9]{10,}.*$", "", s)
    s = _CHECK_ID_RE.sub("_", s)
    return s[:180]


def needs_llm_friendly(locale_key: str, mapped_ok: bool) -> bool:
    if not mapped_ok:
        return True
    return locale_key in _GENERIC_KEYS


def _first_sentence(text: str, max_len: int = 110) -> str:
    t = (text or "").strip()
    if not t:
        return "Hay un tema para revisar"
    # Primera frase
    for sep in (". ", "。", "!\n", "?\n"):
        if sep in t:
            t = t.split(sep, 1)[0].strip()
            break
    else:
        if "." in t:
            t = t.split(".", 1)[0].strip()
    if len(t) > max_len:
        return t[: max_len - 1].rstrip() + "…"
    return t


def friendly_from_i18n(
    *,
    locale_key: str,
    es: LocaleEntry,
    metadata: FindingMetadata,
    domain: str,
) -> FriendlyCopy:
    slug = str(metadata.get("solution_slug") or "")
    action = _SLUG_ACTIONS.get(
        slug,
        "Abrí el recurso en la consola de AWS y aplicá la corrección recomendada.",
    )
    area = str(metadata.get("aws_service") or ("Costos" if domain == "finops" else "Seguridad"))
    return {
        "headline": _first_sentence(es["explanation"]),
        "why": (es.get("business_impact") or "").strip()
        or "Conviene revisarlo para reducir riesgo o gasto innecesario.",
        "action": action,
        "area": area,
    }


def parse_friendly_from_llm(data: dict[str, Any] | None) -> FriendlyCopy | None:
    if not isinstance(data, dict):
        return None
    block = data.get("friendly_es") if isinstance(data.get("friendly_es"), dict) else data
    if not isinstance(block, dict):
        return None
    headline = str(block.get("headline") or block.get("titulo") or "").strip()
    why = str(block.get("why") or block.get("por_que") or block.get("whyItMatters") or "").strip()
    action = str(
        block.get("action") or block.get("que_hacer") or block.get("whatToDo") or ""
    ).strip()
    area = str(block.get("area") or block.get("areaLabel") or "General").strip() or "General"
    if not headline or not why or not action:
        return None
    return {
        "headline": headline[:160],
        "why": why[:400],
        "action": action[:320],
        "area": area[:40],
    }


def _table():  # type: ignore[no-untyped-def]
    name = (
        os.environ.get("DYNAMODB_TABLE_NAME")
        or os.environ.get("TABLE_NAME")
        or os.environ.get("CORE_TABLE_NAME")
    )
    if not name:
        return None
    return boto3.resource(
        "dynamodb",
        config=Config(retries={"max_attempts": 5, "mode": "standard"}),
    ).Table(name)


def cache_sk(check_key: str) -> str:
    return f"FRIENDLY#{check_key}"


def get_cached_friendly(tenant_id: str, check_key: str) -> FriendlyCopy | None:
    if not check_key:
        return None
    table = _table()
    if table is None:
        return None
    try:
        resp = table.get_item(
            Key={"PK": f"TENANT#{tenant_id}", "SK": cache_sk(check_key)},
            ConsistentRead=False,
        )
        item = resp.get("Item") or {}
        return parse_friendly_from_llm(
            {
                "headline": item.get("friendlyHeadline"),
                "why": item.get("friendlyWhy"),
                "action": item.get("friendlyAction"),
                "area": item.get("friendlyArea"),
            }
        )
    except Exception:
        logger.warning("friendly_cache_get_failed", exc_info=True)
        return None


def put_cached_friendly(tenant_id: str, check_key: str, copy: FriendlyCopy) -> None:
    if not check_key:
        return
    table = _table()
    if table is None:
        return
    ttl_days = int(os.environ.get("FRIENDLY_COPY_TTL_DAYS", "90"))
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        table.put_item(
            Item={
                "PK": f"TENANT#{tenant_id}",
                "SK": cache_sk(check_key),
                "entityType": "FRIENDLY_COPY_CACHE",
                "TenantId": tenant_id,
                "checkKey": check_key,
                "friendlyHeadline": copy["headline"],
                "friendlyWhy": copy["why"],
                "friendlyAction": copy["action"],
                "friendlyArea": copy["area"],
                "updatedAtIso": now,
                "ttl": int(time.time()) + ttl_days * 86400,
            }
        )
    except Exception:
        logger.warning("friendly_cache_put_failed", exc_info=True)
