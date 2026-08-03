"""
Matemática de costos en CPU (Python).
El LLM no calcula dinero: aquí se usa get_aws_product_price + multiplicadores.
"""

from __future__ import annotations

import logging

from models import ExtractedVariables
from pricing_engine import get_aws_product_price

logger = logging.getLogger(__name__)

HOURS_PER_MONTH = 730
# Fracción típica recuperable al rightsizing (CPU decide; no el LLM)
RIGHTSIZING_RECOVERY_RATIO = 0.45
# GB-mes de logs asumidos cuando no hay telemetría de volumen
DEFAULT_LOG_GB_MONTH = 5.0


def compute_calculated_savings_usd(
    finding_id: str,
    native_code: str,
    variables: ExtractedVariables,
) -> float:
    """
    Enruta por finding_id / native_code y aplica matemática pura.
    Usa exclusivamente get_aws_product_price (motor universal).
    """
    key = native_code if native_code else finding_id
    region = variables.get("region") or "us-east-1"

    try:
        if key in {"ebs_volume_unattached", "COST_EBS_UNUSED"} or finding_id == "COST_EBS_UNUSED":
            return _savings_ebs_unused(region, variables)

        if (
            key in {"ec2_instance_low_utilization", "COST_EC2_OVERSIZED"}
            or finding_id == "COST_EC2_OVERSIZED"
        ):
            return _savings_ec2_oversized(region, variables)

        if (
            key in {"cloudwatch_log_group_infinite_retention", "COST_SERVERLESS_WASTE"}
            or finding_id == "COST_SERVERLESS_WASTE"
        ):
            return _savings_log_retention(region, variables)

        if finding_id == "COST_GENERIC_ALERT" or key.startswith("COST_"):
            # Válvula: intenta EBS si hay gb; si no, 0
            if int(variables.get("gb") or 0) > 0:
                return _savings_ebs_unused(region, variables)
            if (variables.get("instance_type") or "unknown") != "unknown":
                return _savings_ec2_oversized(region, variables)
            return 0.0
    except Exception:
        logger.exception("cost_math_failed", extra={"finding_id": finding_id, "native_code": key})
        return 0.0

    return 0.0


def _savings_ebs_unused(region: str, variables: ExtractedVariables) -> float:
    gb = max(0, int(variables.get("gb") or 0))
    if gb <= 0:
        return 0.0
    volume_type = variables.get("volume_type") or "gp3"
    if volume_type == "unknown":
        volume_type = "gp3"

    unit = get_aws_product_price(
        "AmazonEC2",
        region,
        {
            "productFamily": "Storage",
            "volumeApiName": volume_type,
        },
    )
    # pricePerUnit típico = USD por GB-mes
    return round(unit * float(gb), 4)


def _savings_ec2_oversized(region: str, variables: ExtractedVariables) -> float:
    instance_type = variables.get("instance_type") or "unknown"
    if instance_type == "unknown":
        return 0.0

    unit = get_aws_product_price(
        "AmazonEC2",
        region,
        {
            "instanceType": instance_type,
            "operatingSystem": "Linux",
            "tenancy": "Shared",
            "capacitystatus": "Used",
            "preInstalledSw": "NA",
        },
    )
    # pricePerUnit típico = USD por hora
    monthly = unit * float(HOURS_PER_MONTH)
    return round(monthly * RIGHTSIZING_RECOVERY_RATIO, 4)


def _savings_log_retention(region: str, variables: ExtractedVariables) -> float:
    """
    Retención infinita: costo de almacenamiento de logs (GB-mes).
    Sin telemetría de volumen usamos DEFAULT_LOG_GB_MONTH.
    retention_days=0 → infinito (ahorro = costo de guardar ese GB-mes de más).
    """
    unit = get_aws_product_price(
        "AmazonCloudWatch",
        region,
        {
            "productFamily": "Storage Snapshot",
            "group": "AWS-Logs-Storage",
        },
    )
    if unit <= 0:
        # Fallback de filtro más genérico CloudWatch Logs
        unit = get_aws_product_price(
            "AmazonCloudWatch",
            region,
            {
                "productFamily": "Storage Snapshot",
            },
        )
    gb = float(variables.get("gb") or 0) or DEFAULT_LOG_GB_MONTH
    return round(unit * gb, 4)
