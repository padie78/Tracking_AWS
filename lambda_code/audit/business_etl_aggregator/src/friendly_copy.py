"""
Copy amigable bilingüe (es + en):
  diccionario i18n → caché Dynamo global por check_id → Bedrock.

Caché compartida:
  PK = SYSTEM#FRIENDLY_COPY
  SK = CHECK#<check_id_normalizado>
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

from models import BilingualFriendly, FindingMetadata, FriendlyCopy, LocaleEntry

logger = logging.getLogger(__name__)

_GENERIC_KEYS = frozenset({"SEC_GENERIC_ALERT", "COST_GENERIC_ALERT"})

_SLUG_ACTIONS_ES: dict[str, str] = {
    "activar-mfa": "Activá MFA para ese usuario desde la consola de IAM (tarda unos minutos).",
    "rotar-credenciales-iam": "Desactivá o borrá las claves que nadie usa hace más de 90 días.",
    "cerrar-puerto-ssh": "Cerrá el puerto 22 al mundo y dejalo solo para tu oficina o VPN.",
    "borrar-ebs-huerfano": "Sacá un respaldo si hace falta y borrá o reconectá el disco.",
    "rightsizing-ec2": "Bajá de tamaño o apagalo fuera de horario laboral.",
    "retenicion-logs": "Definí retención de logs (p. ej. 30–90 días) en el grupo de CloudWatch.",
    "auth-api-gateway": "Agregá login, API keys o un autorizador antes de exponerla.",
    "cifrar-secreto": "Activá cifrado (KMS) y rotá el secreto si estaba expuesto.",
}

_SLUG_ACTIONS_EN: dict[str, str] = {
    "activar-mfa": "Turn on MFA for that user in the IAM console (takes a few minutes).",
    "rotar-credenciales-iam": "Disable or delete keys unused for more than 90 days.",
    "cerrar-puerto-ssh": "Close port 22 to the world; allow only your office IP or VPN.",
    "borrar-ebs-huerfano": "Snapshot if needed, then delete or re-attach the volume.",
    "rightsizing-ec2": "Downsize the instance or stop it outside business hours.",
    "retenicion-logs": "Set log retention (e.g. 30–90 days) on the CloudWatch log group.",
    "auth-api-gateway": "Add login, API keys, or an authorizer before exposing it.",
    "cifrar-secreto": "Enable KMS encryption and rotate the secret if it was exposed.",
}

_DEFAULT_ACTION_ES = "Abrí el recurso en la consola de AWS y aplicá la corrección recomendada."
_DEFAULT_ACTION_EN = "Open the resource in the AWS console and apply the recommended fix."

_CHECK_ID_RE = re.compile(r"[^a-z0-9._-]+", re.I)

FRIENDLY_CACHE_PK = "SYSTEM#FRIENDLY_COPY"


def normalize_check_key(raw: str | None) -> str:
    s = (raw or "").strip().lower()
    if not s:
        return ""
    s = re.sub(r"-\d{12}-[a-z0-9-]+-[a-z0-9]{10,}.*$", "", s)
    s = _CHECK_ID_RE.sub("_", s)
    return s[:180]


def needs_llm_friendly(locale_key: str, mapped_ok: bool) -> bool:
    if not mapped_ok:
        return True
    return locale_key in _GENERIC_KEYS


def _first_sentence(text: str, *, fallback: str, max_len: int = 110) -> str:
    t = (text or "").strip()
    if not t:
        return fallback
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


def _locale_copy(
    entry: LocaleEntry,
    *,
    action: str,
    area: str,
    fallback_headline: str,
    fallback_why: str,
) -> FriendlyCopy:
    return {
        "headline": _first_sentence(entry["explanation"], fallback=fallback_headline),
        "why": (entry.get("business_impact") or "").strip() or fallback_why,
        "action": action,
        "area": area,
    }


def friendly_from_i18n(
    *,
    locale_key: str,
    es: LocaleEntry,
    en: LocaleEntry,
    metadata: FindingMetadata,
    domain: str,
) -> BilingualFriendly:
    del locale_key
    slug = str(metadata.get("solution_slug") or "")
    area = str(
        metadata.get("aws_service")
        or ("Cost" if domain == "finops" else "Security")
    )
    return {
        "es": _locale_copy(
            es,
            action=_SLUG_ACTIONS_ES.get(slug, _DEFAULT_ACTION_ES),
            area=area,
            fallback_headline="Hay un tema para revisar",
            fallback_why="Conviene revisarlo para reducir riesgo o gasto innecesario.",
        ),
        "en": _locale_copy(
            en,
            action=_SLUG_ACTIONS_EN.get(slug, _DEFAULT_ACTION_EN),
            area=area,
            fallback_headline="Something needs a review",
            fallback_why="Review it to reduce risk or unnecessary spend.",
        ),
    }


def _parse_one_locale(block: Any) -> FriendlyCopy | None:
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


def parse_bilingual_from_llm(data: dict[str, Any] | None) -> BilingualFriendly | None:
    if not isinstance(data, dict):
        return None
    es = _parse_one_locale(data.get("friendly_es"))
    en = _parse_one_locale(data.get("friendly_en"))
    # Compat: bloque único legacy → ES, EN = mismo hasta regenerar
    if es is None and en is None:
        one = _parse_one_locale(data)
        if one is None:
            return None
        return {"es": one, "en": one}
    if es is None or en is None:
        # Si el modelo solo mandó un idioma, duplicar para no perder el finding
        base = es or en
        assert base is not None
        return {"es": es or base, "en": en or base}
    return {"es": es, "en": en}


def parse_bilingual_from_item(item: dict[str, Any]) -> BilingualFriendly | None:
    """Lee caché Dynamo (mapas nested o campos flat)."""
    es_map = item.get("friendlyEs")
    en_map = item.get("friendlyEn")
    if isinstance(es_map, dict) and isinstance(en_map, dict):
        parsed = parse_bilingual_from_llm({"friendly_es": es_map, "friendly_en": en_map})
        if parsed:
            return parsed
    # Legacy flat ES-only cache
    legacy = _parse_one_locale(
        {
            "headline": item.get("friendlyHeadline"),
            "why": item.get("friendlyWhy"),
            "action": item.get("friendlyAction"),
            "area": item.get("friendlyArea"),
        }
    )
    if legacy is None:
        return None
    return {"es": legacy, "en": legacy}


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
    return f"CHECK#{check_key}"


def get_cached_friendly(check_key: str) -> BilingualFriendly | None:
    if not check_key:
        return None
    table = _table()
    if table is None:
        return None
    try:
        resp = table.get_item(
            Key={"PK": FRIENDLY_CACHE_PK, "SK": cache_sk(check_key)},
            ConsistentRead=False,
        )
        item = resp.get("Item") or {}
        return parse_bilingual_from_item(item)
    except Exception:
        logger.warning("friendly_cache_get_failed", exc_info=True)
        return None


def put_cached_friendly(check_key: str, copy: BilingualFriendly) -> None:
    if not check_key:
        return
    table = _table()
    if table is None:
        return
    ttl_days = int(os.environ.get("FRIENDLY_COPY_TTL_DAYS", "90"))
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    es, en = copy["es"], copy["en"]
    try:
        table.put_item(
            Item={
                "PK": FRIENDLY_CACHE_PK,
                "SK": cache_sk(check_key),
                "entityType": "FRIENDLY_COPY_CACHE",
                "checkKey": check_key,
                "friendlyEs": dict(es),
                "friendlyEn": dict(en),
                # Flat ES legacy (lectores viejos)
                "friendlyHeadline": es["headline"],
                "friendlyWhy": es["why"],
                "friendlyAction": es["action"],
                "friendlyArea": es["area"],
                "updatedAtIso": now,
                "ttl": int(time.time()) + ttl_days * 86400,
            }
        )
    except Exception:
        logger.warning("friendly_cache_put_failed", exc_info=True)
