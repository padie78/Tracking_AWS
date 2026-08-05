/**
 * Rutas Hive append-only del data lake (time-travel cold path).
 *
 * Convención de producto: en estas keys, `tenant_id` = AWS Account ID (12 dígitos).
 * El tenant Cognito SaaS viaja como columna `org_tenant_id` dentro del Parquet.
 *
 * Ejemplo:
 * cloudquery/tenant_id=123456789012/anio=2026/mes=08/cloudquery_123456789012_20260802-1345.parquet
 */

export type HistoricalEngine =
  | 'cloudquery'
  | 'prowler'
  | 'trivy'
  | 'infracost'
  | 'komiser';

export function formatHiveTimestamp(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}`;
}

export function buildHistoricalParquetKey(input: {
  engine: HistoricalEngine;
  /** AWS account ID — 12 dígitos (partición tenant_id del data lake). */
  awsAccountId: string;
  capturedAt?: Date;
}): { key: string; filenamePrefix: string; anio: string; mes: string } {
  const accountId = input.awsAccountId.trim();
  if (!/^\d{12}$/.test(accountId)) {
    throw new Error(
      `awsAccountId inválido para Hive path (se esperan 12 dígitos): ${accountId}`,
    );
  }
  const capturedAt = input.capturedAt ?? new Date();
  const anio = String(capturedAt.getUTCFullYear());
  const mes = String(capturedAt.getUTCMonth() + 1).padStart(2, '0');
  const filenamePrefix = formatHiveTimestamp(capturedAt);
  const file = `${input.engine}_${accountId}_${filenamePrefix}.parquet`;
  const key = `${input.engine}/tenant_id=${accountId}/anio=${anio}/mes=${mes}/${file}`;
  return { key, filenamePrefix, anio, mes };
}
