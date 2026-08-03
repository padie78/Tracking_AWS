"""Tipos estrictos del contrato ETL (LLM → Pricing → Dynamo)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, NotRequired, TypedDict


Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
TargetAudience = Literal["Business_Owner", "SysAdmin", "Developer"]
RemediationType = Literal["Console_Click", "Code_Fix", "Auto_Remediation"]
RollbackRisk = Literal["NONE", "LOW", "MEDIUM", "HIGH"]
LocaleCode = Literal["en", "es"]


class ExtractedVariables(TypedDict):
    region: str
    volume_type: str
    gb: int
    instance_type: str
    retention_days: int


class FriendlyCopy(TypedDict):
    """Copy amigable en un idioma (headline / por qué / qué hacer)."""

    headline: str
    why: str
    action: str
    area: str


class BilingualFriendly(TypedDict):
    es: FriendlyCopy
    en: FriendlyCopy


class LlmClassification(TypedDict):
    finding_id: str
    native_code: str
    resource_id: str
    extracted_variables: ExtractedVariables
    friendly: NotRequired[BilingualFriendly]


class ComplianceMap(TypedDict):
    iso_27001: list[str]
    soc_2: list[str]
    pci_dss: list[str]


class FindingMetadata(TypedDict):
    aws_service: str
    severity: Severity
    target_audience: TargetAudience
    remediation_type: RemediationType
    estimated_time_to_fix: str
    rollback_risk: RollbackRisk
    compliance: ComplianceMap
    solution_slug: str
    # Categoría macro de respaldo (solo en native_code específicos)
    macro_fallback: NotRequired[str]


class LocaleEntry(TypedDict):
    explanation: str
    business_impact: str


class AggregatorEvent(TypedDict, total=False):
    """Acepta camelCase del SFN actual y PascalCase del contrato del prompt."""

    TenantId: str
    AwsAccountId: str
    tenantId: str
    accountId: str
    auditId: str
    correlationId: str
    # Hallazgos crudos pre-cargados o refs S3
    raw_findings: list[dict[str, Any]]
    findings: list[dict[str, Any]]
    sourceBucket: str
    sourceKey: str
    secops: dict[str, Any]
    finops: dict[str, Any]
    appsec: dict[str, Any]


@dataclass(frozen=True, slots=True)
class EnrichedFinding:
    tenant_id: str
    aws_account_id: str
    audit_id: str
    finding_id: str
    native_code: str
    resolved_locale_key: str
    resource_id: str
    extracted_variables: ExtractedVariables
    metadata: FindingMetadata
    i18n: Mapping[LocaleCode, LocaleEntry]
    calculated_savings_usd: float
    domain: Literal["secops", "finops"]
    source_engine: str
    raw_title: str = ""
    check_id: str = ""
    friendly: BilingualFriendly | None = None
    extra: dict[str, Any] = field(default_factory=dict)
