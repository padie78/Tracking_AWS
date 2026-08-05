#!/usr/bin/env bash
# Komiser Fargate — AssumeRole → inventario financiero → JSON → S3 (task role)
#
# NOTA: Komiser CLI NO expone `dashboard --export-json`. El flujo headless real es:
#   1) config.toml + credenciales STS
#   2) `komiser start` (servidor local + SQLite)
#   3) exportar vía API HTTP local → JSON plano
#   4) subir a S3 y exit 0/≠0 para Step Functions (.sync)
set -euo pipefail

# Aliases del contrato Track_AWS + prompt Komiser
ROLE_ARN="${ROLE_ARN:-${VEND_ROLE_ARN:-}}"
TENANT_ID="${TENANT_ID:-${TenantId:-}}"
AUDIT_ID="${AUDIT_ID:-${ScanId:-}}"
ACCOUNT_ID="${ACCOUNT_ID:-${AwsAccountId:-}}"
EXTERNAL_ID="${EXTERNAL_ID:-}"
: "${ROLE_ARN:?ROLE_ARN / VEND_ROLE_ARN required}"
: "${EXTERNAL_ID:?EXTERNAL_ID required (anti confused-deputy)}"
: "${ACCOUNT_ID:?ACCOUNT_ID / AwsAccountId required}"
: "${TENANT_ID:?TENANT_ID / TenantId required}"
: "${AUDIT_ID:?AUDIT_ID / ScanId required}"
: "${OUTPUT_BUCKET:?OUTPUT_BUCKET required}"
: "${AWS_REGION:=eu-central-1}"

OUTPUT_KEY="${OUTPUT_KEY:-tenants/${TENANT_ID}/audits/${AUDIT_ID}/komiser/findings.json}"
WORK_DIR="${WORK_DIR:-/tmp/komiser-out}"
REPORT_JSON="${REPORT_JSON:-/tmp/report-komiser.json}"
CONFIG_TOML="${CONFIG_TOML:-${WORK_DIR}/config.toml}"
DB_FILE="${DB_FILE:-${WORK_DIR}/komiser.db}"
KOMISER_PORT="${KOMISER_PORT:-3000}"
REGIONS="${REGIONS:-eu-central-1}"
# Tiempo máximo esperando que el inventario esté listo (segundos)
SCAN_TIMEOUT_SEC="${SCAN_TIMEOUT_SEC:-480}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-5}"
MIN_RESOURCES="${MIN_RESOURCES:-1}"

mkdir -p "${WORK_DIR}"
chmod 700 "${WORK_DIR}"

SAVED_CONTAINER_CREDS_URI="${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:-}"
SAVED_ACCESS_KEY="${AWS_ACCESS_KEY_ID:-}"
SAVED_SECRET_KEY="${AWS_SECRET_ACCESS_KEY:-}"
SAVED_SESSION="${AWS_SESSION_TOKEN:-}"

restore_task_credentials() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN || true
  if [ -n "${SAVED_CONTAINER_CREDS_URI}" ]; then
    export AWS_CONTAINER_CREDENTIALS_RELATIVE_URI="${SAVED_CONTAINER_CREDS_URI}"
  elif [ -n "${SAVED_ACCESS_KEY}" ]; then
    export AWS_ACCESS_KEY_ID="${SAVED_ACCESS_KEY}"
    export AWS_SECRET_ACCESS_KEY="${SAVED_SECRET_KEY}"
    export AWS_SESSION_TOKEN="${SAVED_SESSION}"
  fi
}

die() {
  echo "[komiser-fargate] ERROR: $*" >&2
  restore_task_credentials || true
  exit 1
}

cleanup() {
  if [ -n "${KOMISER_PID:-}" ] && kill -0 "${KOMISER_PID}" 2>/dev/null; then
    kill "${KOMISER_PID}" 2>/dev/null || true
    wait "${KOMISER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[komiser-fargate] Assuming role ${ROLE_ARN}"
set +e
CREDS_JSON="$(aws sts assume-role \
  --role-arn "${ROLE_ARN}" \
  --role-session-name "komiser-${AUDIT_ID:0:40}" \
  --external-id "${EXTERNAL_ID}" \
  --duration-seconds 3600 \
  --output json 2>"${WORK_DIR}/assume-role.err")"
ASSUME_RC=$?
set -e
if [ "${ASSUME_RC}" -ne 0 ] || [ -z "${CREDS_JSON}" ]; then
  die "sts:AssumeRole failed (rc=${ASSUME_RC}). $(tr '\n' ' ' <"${WORK_DIR}/assume-role.err" 2>/dev/null || true)"
fi

export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN
AWS_ACCESS_KEY_ID="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["AccessKeyId"])')"
AWS_SECRET_ACCESS_KEY="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SecretAccessKey"])')"
AWS_SESSION_TOKEN="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SessionToken"])')"
unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || true

# config.toml — ENVIRONMENT_VARIABLES usa las credenciales STS del proceso
cat >"${CONFIG_TOML}" <<EOF
[[aws]]
name = "trackaws-${ACCOUNT_ID}"
source = "ENVIRONMENT_VARIABLES"

[sqlite]
file = "${DB_FILE}"
EOF

echo "[komiser-fargate] Starting Komiser regions=${REGIONS} port=${KOMISER_PORT}"
# Telemetry off si la versión lo soporta; ignorar flag desconocido
set +e
komiser start \
  --config "${CONFIG_TOML}" \
  --port "${KOMISER_PORT}" \
  --regions "${REGIONS}" \
  --no-telemetry \
  >"${WORK_DIR}/komiser.log" 2>&1 &
KOMISER_PID=$!
set -e

# Si --no-telemetry falló al arrancar, reintentar sin el flag
sleep 2
if ! kill -0 "${KOMISER_PID}" 2>/dev/null; then
  echo "[komiser-fargate] retry without --no-telemetry"
  set +e
  komiser start \
    --config "${CONFIG_TOML}" \
    --port "${KOMISER_PORT}" \
    --regions "${REGIONS}" \
    >"${WORK_DIR}/komiser.log" 2>&1 &
  KOMISER_PID=$!
  set -e
  sleep 2
fi

if ! kill -0 "${KOMISER_PID}" 2>/dev/null; then
  die "komiser process died. Log: $(tail -c 2000 "${WORK_DIR}/komiser.log" 2>/dev/null || true)"
fi

echo "[komiser-fargate] Waiting for inventory (timeout=${SCAN_TIMEOUT_SEC}s)"
deadline=$((SECONDS + SCAN_TIMEOUT_SEC))
ready=0
while [ "${SECONDS}" -lt "${deadline}" ]; do
  if ! kill -0 "${KOMISER_PID}" 2>/dev/null; then
    die "komiser crashed during scan. Log: $(tail -c 2000 "${WORK_DIR}/komiser.log" 2>/dev/null || true)"
  fi
  # API local: listado global de recursos (JSON)
  set +e
  RESP="$(curl -sS -m 10 -X POST "http://127.0.0.1:${KOMISER_PORT}/global/resources" \
    -H "Content-Type: application/json" \
    -d '{"filters":[],"limit":10000,"skip":0}' 2>"${WORK_DIR}/curl.err")"
  CURL_RC=$?
  set -e
  if [ "${CURL_RC}" -eq 0 ] && [ -n "${RESP}" ]; then
    COUNT="$(echo "${RESP}" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    if isinstance(d, list):
        print(len(d))
    elif isinstance(d, dict):
        for k in ("data", "resources", "items", "result"):
            if isinstance(d.get(k), list):
                print(len(d[k])); break
        else:
            print(d.get("count") or d.get("total") or 0)
    else:
        print(0)
except Exception:
    print(0)
' 2>/dev/null || echo 0)"
    echo "[komiser-fargate] poll resources≈${COUNT}"
    if [ "${COUNT}" -ge "${MIN_RESOURCES}" ]; then
      echo "${RESP}" >"${REPORT_JSON}.raw"
      ready=1
      break
    fi
  fi
  sleep "${POLL_INTERVAL_SEC}"
done

if [ "${ready}" -ne 1 ]; then
  die "inventory timeout or empty (min=${MIN_RESOURCES}). Log: $(tail -c 1500 "${WORK_DIR}/komiser.log" 2>/dev/null || true)"
fi

# Empaquetar reporte plano multi-tenant
python3 - "${REPORT_JSON}" "${REPORT_JSON}.raw" "${TENANT_ID}" "${AUDIT_ID}" "${ACCOUNT_ID}" <<'PY'
import json, sys
from datetime import datetime, timezone

out_path, raw_path, tenant_id, audit_id, account_id = sys.argv[1:6]
raw = json.loads(open(raw_path, encoding="utf-8").read())
resources = raw
if isinstance(raw, dict):
    for k in ("data", "resources", "items", "result"):
        if isinstance(raw.get(k), list):
            resources = raw[k]
            break
if not isinstance(resources, list):
    resources = []

payload = {
    "engine": "komiser-fargate",
    "exportedAtIso": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "tenantId": tenant_id,
    "auditId": audit_id,
    "accountId": account_id,
    "resourceCount": len(resources),
    "resources": resources,
}
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
print(f"[komiser-fargate] packed resources={len(resources)} → {out_path}")
PY

# Subir con task role (no con el rol del cliente)
restore_task_credentials

aws s3 cp "${REPORT_JSON}" "s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}" \
  --content-type "application/json" \
  --sse AES256 \
  || die "s3 put failed s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"

echo "[komiser-fargate] Uploaded s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"
exit 0
