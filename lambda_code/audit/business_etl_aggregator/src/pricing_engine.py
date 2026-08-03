"""
Motor UNIVERSAL de precios — UNA sola función maestra.

Flujo: memoria del run → Dynamo (SYSTEM#AWS_PRICING) → AWS Price List API (us-east-1).
Prohibido crear helpers por servicio (EC2/S3/RDS) o por métrica.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from decimal import Decimal
from functools import lru_cache
from typing import Any, Mapping

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

PRICING_CACHE_PK = "SYSTEM#AWS_PRICING"

# Códigos de región → Location string exacto de AWS Price List API
REGION_TO_LOCATION: dict[str, str] = {
    "us-east-1": "US East (N. Virginia)",
    "us-east-2": "US East (Ohio)",
    "us-west-1": "US West (N. California)",
    "us-west-2": "US West (Oregon)",
    "ca-central-1": "Canada (Central)",
    "eu-central-1": "EU (Frankfurt)",
    "eu-west-1": "EU (Ireland)",
    "eu-west-2": "EU (London)",
    "eu-west-3": "EU (Paris)",
    "eu-north-1": "EU (Stockholm)",
    "eu-south-1": "EU (Milan)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
    "ap-northeast-2": "Asia Pacific (Seoul)",
    "ap-northeast-3": "Asia Pacific (Osaka)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-2": "Asia Pacific (Sydney)",
    "ap-south-1": "Asia Pacific (Mumbai)",
    "sa-east-1": "South America (Sao Paulo)",
    "me-south-1": "Middle East (Bahrain)",
    "af-south-1": "Africa (Cape Town)",
}

# Memoria por invocación Lambda (dedupe intra-audit)
_memory_price: dict[str, float] = {}


def map_region_to_location(region: str) -> str:
    """Convierte us-east-1 → 'US East (N. Virginia)'. Fallback Virginia."""
    code = (region or "").strip().lower()
    if code in {"", "unknown", "multi", "global"}:
        return REGION_TO_LOCATION["us-east-1"]
    return REGION_TO_LOCATION.get(code, REGION_TO_LOCATION["us-east-1"])


def normalize_region_code(region: str) -> str:
    code = (region or "").strip().lower()
    if code in {"", "unknown", "multi", "global"}:
        return "us-east-1"
    return code if code in REGION_TO_LOCATION else "us-east-1"


def price_cache_sk(service_name: str, region: str, filters_dict: Mapping[str, str]) -> str:
    """SK estable: PRICE#<service>#<region>#<hash filtros>."""
    region_code = normalize_region_code(region)
    payload = {
        "service": service_name,
        "region": region_code,
        "filters": {str(k): str(v) for k, v in sorted(filters_dict.items())},
    }
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:20]
    safe_service = service_name.replace("#", "_")[:40]
    return f"PRICE#{safe_service}#{region_code}#{digest}"


@lru_cache(maxsize=1)
def _pricing_client():  # type: ignore[no-untyped-def]
    # Price List API solo está en us-east-1 (catálogo global)
    return boto3.client(
        "pricing",
        region_name="us-east-1",
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


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


def _ttl_days() -> int:
    try:
        return max(1, int(os.environ.get("PRICING_CACHE_TTL_DAYS", "14")))
    except ValueError:
        return 14


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_price_from_api(
    service_name: str,
    region: str,
    filters_dict: Mapping[str, str],
) -> float:
    """Llama GetProducts (sin caché)."""
    location = map_region_to_location(region)
    merged: dict[str, str] = {"location": location, **dict(filters_dict)}
    api_filters = [
        {"Type": "TERM_MATCH", "Field": str(k), "Value": str(v)}
        for k, v in merged.items()
        if v and str(v).lower() != "unknown"
    ]

    client = _pricing_client()
    try:
        paginator = client.get_paginator("get_products")
        for page in paginator.paginate(
            ServiceCode=service_name,
            Filters=api_filters,
            MaxResults=5,
        ):
            for price_item in page.get("PriceList") or []:
                unit = _extract_price_per_unit(price_item)
                if unit is not None and unit >= 0:
                    return float(unit)
    except Exception:
        logger.exception(
            "pricing_get_products_failed",
            extra={"service": service_name, "region": region, "filters": dict(filters_dict)},
        )
        return 0.0

    logger.info(
        "pricing_no_match",
        extra={"service": service_name, "region": region, "filters": dict(filters_dict)},
    )
    return 0.0


def get_cached_price_item(sk: str) -> dict[str, Any] | None:
    table = _table()
    if table is None:
        return None
    try:
        resp = table.get_item(Key={"PK": PRICING_CACHE_PK, "SK": sk}, ConsistentRead=False)
        item = resp.get("Item")
        return item if isinstance(item, dict) else None
    except Exception:
        logger.warning("pricing_cache_get_failed", exc_info=True)
        return None


def put_cached_price(
    *,
    sk: str,
    service_name: str,
    region: str,
    filters_dict: Mapping[str, str],
    price_per_unit: float,
    previous_price: float | None = None,
) -> None:
    table = _table()
    if table is None:
        return
    region_code = normalize_region_code(region)
    now = _now_iso()
    ttl_days = _ttl_days()
    # TTL largo: el job semanal refresca; TTL evita basura abandonada (~90d)
    item: dict[str, Any] = {
        "PK": PRICING_CACHE_PK,
        "SK": sk,
        "entityType": "AWS_PRICING_CACHE",
        "serviceName": service_name,
        "region": region_code,
        "location": map_region_to_location(region_code),
        "filters": {str(k): str(v) for k, v in sorted(filters_dict.items())},
        "pricePerUnit": Decimal(str(round(price_per_unit, 8))),
        "currency": "USD",
        "fetchedAtIso": now,
        "updatedAtIso": now,
        "ttl": int(time.time()) + max(ttl_days, 90) * 86400,
    }
    if previous_price is not None and abs(previous_price - price_per_unit) > 1e-9:
        item["previousPricePerUnit"] = Decimal(str(round(previous_price, 8)))
        item["priceChangedAtIso"] = now
    try:
        table.put_item(Item=item)
    except Exception:
        logger.warning("pricing_cache_put_failed", exc_info=True)


def _cache_is_fresh(item: dict[str, Any]) -> bool:
    fetched = str(item.get("fetchedAtIso") or "")
    if not fetched:
        return False
    try:
        # 2026-08-03T12:00:00Z
        ts = datetime.fromisoformat(fetched.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - ts).total_seconds() / 86400.0
        return age_days <= float(_ttl_days())
    except ValueError:
        return False


def get_aws_product_price(
    service_name: str,
    region: str,
    filters_dict: Mapping[str, str],
) -> float:
    """
    ÚNICA función maestra de precios.

    - service_name: 'AmazonEC2', 'AmazonCloudWatch', 'AmazonRDS', …
    - region: código oficial (us-east-1) → se mapea a Location descriptivo
    - filters_dict: campos TERM_MATCH adicionales (sin Location; se inyecta aquí)

    Devuelve pricePerUnit (float) del primer OnDemand encontrado; 0.0 si no hay match.
    """
    region_code = normalize_region_code(region)
    clean_filters = {str(k): str(v) for k, v in filters_dict.items() if v and str(v).lower() != "unknown"}
    sk = price_cache_sk(service_name, region_code, clean_filters)

    if sk in _memory_price:
        return _memory_price[sk]

    cached = get_cached_price_item(sk)
    if cached is not None and _cache_is_fresh(cached):
        try:
            price = float(cached.get("pricePerUnit") or 0)
        except (TypeError, ValueError):
            price = 0.0
        _memory_price[sk] = price
        return price

    price = fetch_price_from_api(service_name, region_code, clean_filters)
    prev: float | None = None
    if cached is not None:
        try:
            prev = float(cached.get("pricePerUnit") or 0)
        except (TypeError, ValueError):
            prev = None
    put_cached_price(
        sk=sk,
        service_name=service_name,
        region=region_code,
        filters_dict=clean_filters,
        price_per_unit=price,
        previous_price=prev,
    )
    _memory_price[sk] = price
    return price


def list_cached_price_items() -> list[dict[str, Any]]:
    table = _table()
    if table is None:
        return []
    items: list[dict[str, Any]] = []
    try:
        kwargs: dict[str, Any] = {
            "KeyConditionExpression": "PK = :pk AND begins_with(SK, :sk)",
            "ExpressionAttributeValues": {":pk": PRICING_CACHE_PK, ":sk": "PRICE#"},
        }
        while True:
            page = table.query(**kwargs)
            for it in page.get("Items") or []:
                if isinstance(it, dict):
                    items.append(it)
            lek = page.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
    except Exception:
        logger.exception("pricing_cache_list_failed")
    return items


def _extract_price_per_unit(price_item: str | dict[str, Any]) -> float | None:
    try:
        payload = json.loads(price_item) if isinstance(price_item, str) else price_item
    except (TypeError, json.JSONDecodeError):
        return None

    terms = (payload.get("terms") or {}).get("OnDemand") or {}
    for term in terms.values():
        price_dimensions = term.get("priceDimensions") or {}
        for dim in price_dimensions.values():
            usd = (dim.get("pricePerUnit") or {}).get("USD")
            if usd is None:
                continue
            try:
                return float(usd)
            except (TypeError, ValueError):
                continue
    return None
