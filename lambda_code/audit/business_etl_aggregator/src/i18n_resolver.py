"""Resolución i18n de dos niveles: native_code → finding_id → válvula genérica."""

from __future__ import annotations

from string import Formatter
from typing import Mapping

from dictionary_metadata import DICTIONARY_METADATA
from i18n_locales_en import LOCALES_EN
from i18n_locales_es import LOCALES_ES
from models import ExtractedVariables, FindingMetadata, LocaleCode, LocaleEntry

_LOCALES: Mapping[LocaleCode, Mapping[str, LocaleEntry]] = {
    "en": LOCALES_EN,
    "es": LOCALES_ES,
}


def resolve_locale_key(native_code: str, finding_id: str) -> str:
    """
    1) native_code si existe en diccionario
    2) finding_id macro
    3) SEC_GENERIC_ALERT / COST_GENERIC_ALERT según prefijo
    """
    if native_code in DICTIONARY_METADATA or native_code in LOCALES_EN:
        return native_code
    if finding_id in DICTIONARY_METADATA or finding_id in LOCALES_EN:
        return finding_id
    if finding_id.startswith("COST_") or native_code.startswith("COST_"):
        return "COST_GENERIC_ALERT"
    return "SEC_GENERIC_ALERT"


def resolve_metadata(locale_key: str) -> FindingMetadata:
    meta = DICTIONARY_METADATA.get(locale_key)
    if meta is not None:
        return meta
    if locale_key.startswith("COST_"):
        return DICTIONARY_METADATA["COST_GENERIC_ALERT"]
    return DICTIONARY_METADATA["SEC_GENERIC_ALERT"]


def _format_safe(template: str, values: Mapping[str, object]) -> str:
    """Formatea solo placeholders presentes; ignora llaves desconocidas."""
    formatter = Formatter()
    out: list[str] = []
    for literal, field_name, format_spec, conversion in formatter.parse(template):
        out.append(literal)
        if field_name is None:
            continue
        if field_name not in values:
            out.append("{" + field_name + "}")
            continue
        value = values[field_name]
        if conversion == "s":
            value = str(value)
        elif conversion == "r":
            value = repr(value)
        if format_spec:
            out.append(format(value, format_spec))
        else:
            out.append(str(value))
    return "".join(out)


def build_i18n_bundle(
    locale_key: str,
    variables: ExtractedVariables,
    calculated_savings: float,
) -> dict[LocaleCode, LocaleEntry]:
    values: dict[str, object] = {
        "gb": round(float(variables.get("gb") or 0), 3),
        "instance_type": variables.get("instance_type") or "unknown",
        "retention_days": int(variables.get("retention_days") or 0),
        "calculated_savings": f"{calculated_savings:.2f}",
    }
    bundle: dict[LocaleCode, LocaleEntry] = {}
    for lang, catalog in _LOCALES.items():
        entry = catalog.get(locale_key) or catalog.get(
            "SEC_GENERIC_ALERT" if not locale_key.startswith("COST_") else "COST_GENERIC_ALERT"
        )
        assert entry is not None
        bundle[lang] = {
            "explanation": _format_safe(entry["explanation"], values),
            "business_impact": _format_safe(entry["business_impact"], values),
        }
    return bundle
