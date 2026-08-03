"""Filtrado técnico previo — elimina ~90% del ruido PASS/OK/INFO."""

from __future__ import annotations

from typing import Any, Iterable

_PASS_STATUSES = frozenset(
    {
        "PASS",
        "PASSED",
        "SUCCESS",
        "OK",
        "INFO",
        "INFORMATIONAL",
        "NOT_APPLICABLE",
        "N/A",
        "MANUAL",
    }
)

_FAIL_HINTS = frozenset(
    {
        "FAIL",
        "FAILED",
        "ERROR",
        "CRITICAL",
        "HIGH",
        "MEDIUM",
        "LOW",
        "WARN",
        "WARNING",
        "ALARM",
        "OPEN",
        "VULNERABLE",
    }
)


def _status_of(row: dict[str, Any]) -> str:
    for key in ("status", "Status", "result", "Result", "state", "State"):
        val = row.get(key)
        if val is not None:
            return str(val).strip().upper()
    sev = row.get("severity") or row.get("Severity")
    if sev is not None:
        return str(sev).strip().upper()
    return ""


def is_noise_row(row: dict[str, Any]) -> bool:
    status = _status_of(row)
    if status in _PASS_STATUSES:
        return True
    # Filas explícitamente verdes
    if str(row.get("passed") or "").lower() in {"true", "1", "yes"}:
        return True
    if str(row.get("ok") or "").lower() in {"true", "1", "yes"} and not row.get("findingId"):
        # ok=true en refs de motor no es finding
        if "engine" in row and "findings" not in row:
            return True
    return False


def prefilter_findings(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Conserva solo filas con señal de fallo / hallazgo accionable."""
    kept: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if is_noise_row(row):
            continue
        status = _status_of(row)
        # Si no hay status, igual puede ser finding CloudQuery/Infracost/Trivy
        if status and status not in _FAIL_HINTS and status not in {"", "UNKNOWN"}:
            # Status raro no-pass: conservamos por seguridad
            kept.append(row)
            continue
        kept.append(row)
    return kept
