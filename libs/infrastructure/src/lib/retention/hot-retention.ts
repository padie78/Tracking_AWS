/**
 * Retención hot-path Dynamo (UI). Histórico largo → S3 Parquet / Athena.
 *
 * - Findings + inventario: TTL corto (default 14d) + prune a N audits recientes.
 * - Audit job (scores/counts): TTL más largo (default 90d) para listar historial liviano.
 * - Tenant/cuenta/alertas: sin TTL aquí.
 */
export function auditDetailTtlEpochSeconds(nowMs = Date.now()): number {
  const days = parsePositiveInt(process.env['AUDIT_DETAIL_TTL_DAYS'], 14);
  return Math.floor(nowMs / 1000) + days * 86_400;
}

export function auditJobTtlEpochSeconds(nowMs = Date.now()): number {
  const days = parsePositiveInt(process.env['AUDIT_JOB_TTL_DAYS'], 90);
  return Math.floor(nowMs / 1000) + days * 86_400;
}

/** Cuántos audits recientes conservan findings+inventario en Dynamo. */
export function auditHotKeepCount(): number {
  return parsePositiveInt(process.env['AUDIT_HOT_KEEP_COUNT'], 3);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
