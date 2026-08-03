"""
Refresh semanal del catálogo de precios cacheado en Dynamo.

- Recorre SYSTEM#AWS_PRICING / PRICE#*
- Reconsulta AWS Price List API
- Diff vs precio guardado; actualiza previousPricePerUnit si cambió
- Si la caché está vacía, siembra SKUs FinOps frecuentes (hot set)
"""

from __future__ import annotations

import logging
import time
from typing import Any

from pricing_engine import (
    fetch_price_from_api,
    get_cached_price_item,
    list_cached_price_items,
    price_cache_sk,
    put_cached_price,
)

logger = logging.getLogger(__name__)

# Hot set: precios que casi siempre necesitamos en FinOps Track_AWS
SEED_SKUS: list[dict[str, Any]] = [
    {
        "serviceName": "AmazonEC2",
        "region": "eu-central-1",
        "filters": {"productFamily": "Storage", "volumeApiName": "gp3"},
    },
    {
        "serviceName": "AmazonEC2",
        "region": "eu-central-1",
        "filters": {"productFamily": "Storage", "volumeApiName": "gp2"},
    },
    {
        "serviceName": "AmazonEC2",
        "region": "eu-central-1",
        "filters": {
            "instanceType": "t3.micro",
            "operatingSystem": "Linux",
            "tenancy": "Shared",
            "capacitystatus": "Used",
            "preInstalledSw": "NA",
        },
    },
    {
        "serviceName": "AmazonEC2",
        "region": "eu-central-1",
        "filters": {
            "instanceType": "t3.small",
            "operatingSystem": "Linux",
            "tenancy": "Shared",
            "capacitystatus": "Used",
            "preInstalledSw": "NA",
        },
    },
    {
        "serviceName": "AmazonEC2",
        "region": "eu-central-1",
        "filters": {
            "instanceType": "t3.medium",
            "operatingSystem": "Linux",
            "tenancy": "Shared",
            "capacitystatus": "Used",
            "preInstalledSw": "NA",
        },
    },
    {
        "serviceName": "AmazonEC2",
        "region": "eu-central-1",
        "filters": {
            # Elastic IP idle (Public IPv4) — filtros típicos Price List
            "productFamily": "IP Address",
            "group": "VPC-Address",
        },
    },
    {
        "serviceName": "AmazonCloudWatch",
        "region": "eu-central-1",
        "filters": {"productFamily": "Storage Snapshot", "group": "AWS-Logs-Storage"},
    },
    {
        "serviceName": "AmazonEC2",
        "region": "us-east-1",
        "filters": {"productFamily": "Storage", "volumeApiName": "gp3"},
    },
    {
        "serviceName": "AmazonCloudWatch",
        "region": "us-east-1",
        "filters": {"productFamily": "Storage Snapshot", "group": "AWS-Logs-Storage"},
    },
]


def _refresh_one(
    *,
    service_name: str,
    region: str,
    filters: dict[str, str],
    existing: dict[str, Any] | None,
) -> dict[str, Any]:
    sk = price_cache_sk(service_name, region, filters)
    old_price = None
    if existing is not None:
        try:
            old_price = float(existing.get("pricePerUnit") or 0)
        except (TypeError, ValueError):
            old_price = None

    new_price = fetch_price_from_api(service_name, region, filters)
    changed = old_price is not None and abs(old_price - new_price) > 1e-9

    put_cached_price(
        sk=sk,
        service_name=service_name,
        region=region,
        filters_dict=filters,
        price_per_unit=new_price,
        previous_price=old_price if changed else None,
    )

    return {
        "sk": sk,
        "serviceName": service_name,
        "region": region,
        "oldPrice": old_price,
        "newPrice": new_price,
        "changed": changed,
    }


def ensure_seed_skus() -> list[dict[str, Any]]:
    """Inserta hot set si aún no existe en caché."""
    results: list[dict[str, Any]] = []
    for sku in SEED_SKUS:
        service = str(sku["serviceName"])
        region = str(sku["region"])
        filters = dict(sku["filters"])
        sk = price_cache_sk(service, region, filters)
        existing = get_cached_price_item(sk)
        if existing is not None:
            continue
        results.append(
            _refresh_one(
                service_name=service,
                region=region,
                filters=filters,
                existing=None,
            )
        )
        time.sleep(0.05)
    return results


def refresh_pricing_cache() -> dict[str, Any]:
    """
    Job semanal: seed + refresh de todas las claves cacheadas.
    """
    seeded = ensure_seed_skus()
    cached = list_cached_price_items()
    refreshed: list[dict[str, Any]] = []
    changed: list[dict[str, Any]] = []

    for item in cached:
        service = str(item.get("serviceName") or "")
        region = str(item.get("region") or "us-east-1")
        filters_raw = item.get("filters") or {}
        if not service or not isinstance(filters_raw, dict):
            continue
        filters = {str(k): str(v) for k, v in filters_raw.items()}
        try:
            row = _refresh_one(
                service_name=service,
                region=region,
                filters=filters,
                existing=item,
            )
            refreshed.append(row)
            if row["changed"]:
                changed.append(row)
                logger.warning(
                    "pricing_changed",
                    extra={
                        "sk": row["sk"],
                        "old": row["oldPrice"],
                        "new": row["newPrice"],
                        "service": service,
                        "region": region,
                    },
                )
            time.sleep(0.08)
        except Exception:
            logger.exception(
                "pricing_refresh_item_failed",
                extra={"service": service, "region": region},
            )

    return {
        "ok": True,
        "mode": "pricing_refresh",
        "seededCount": len(seeded),
        "refreshedCount": len(refreshed),
        "changedCount": len(changed),
        "changed": changed[:50],
    }
