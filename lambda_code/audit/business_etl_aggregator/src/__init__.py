"""
Business ETL Aggregator — último paso de la Step Function.

Pipeline:
  1) Filtrado técnico (elimina PASS/OK/INFO)
  2) Clasificación Bedrock (contrato JSON fijo; sin costos)
  3) Mapeo i18n de dos niveles (native_code → finding_id)
  4) Costos vía UN único motor AWS Pricing API
  5) Persistencia DynamoDB multi-tenant (TENANT#…)
"""

from __future__ import annotations

__version__ = "1.0.0"
