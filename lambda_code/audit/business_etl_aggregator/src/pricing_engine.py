"""
Motor UNIVERSAL de precios — UNA sola función maestra.
Prohibido crear helpers por servicio (EC2/S3/RDS) o por métrica.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any, Mapping

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

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


def map_region_to_location(region: str) -> str:
    """Convierte us-east-1 → 'US East (N. Virginia)'. Fallback Virginia."""
    code = (region or "").strip().lower()
    if code in {"", "unknown", "multi", "global"}:
        return REGION_TO_LOCATION["us-east-1"]
    return REGION_TO_LOCATION.get(code, REGION_TO_LOCATION["us-east-1"])


@lru_cache(maxsize=1)
def _pricing_client():  # type: ignore[no-untyped-def]
    # Price List API solo está en us-east-1
    return boto3.client(
        "pricing",
        region_name="us-east-1",
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


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
