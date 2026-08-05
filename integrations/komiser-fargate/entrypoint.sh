#!/usr/bin/env bash
# Komiser Fargate — AssumeRole → inventario financiero → JSON → S3 (task role)
#
# Komiser no tiene `dashboard --export-json`. Flujo headless:
#   AssumeRole → config.toml → `komiser start` → POST /resources/search → S3 → exit 0
#
# IMPORTANTE: NO usar POST /global/resources (es breakdown del dashboard y dispara
# errores SQL "near as"). El listado correcto es POST /resources/search.
set -euo pipefail

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
CREDS_FILE="${CREDS_FILE:-${WORK_DIR}/aws-credentials}"
DB_FILE="${DB_FILE:-${WORK_DIR}/komiser.db}"
KOMISER_PORT="${KOMISER_PORT:-3000}"
REGIONS="${REGIONS:-eu-central-1}"
SCAN_TIMEOUT_SEC="${SCAN_TIMEOUT_SEC:-540}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-8}"
MIN_RESOURCES="${MIN_RESOURCES:-1}"
PAGE_LIMIT="${PAGE_LIMIT:-5000}"

mkdir -p "${WORK_DIR}"
chmod 700 "${WORK_DIR}"
cd "${WORK_DIR}"

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

AWS_ACCESS_KEY_ID="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["AccessKeyId"])')"
AWS_SECRET_ACCESS_KEY="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SecretAccessKey"])')"
AWS_SESSION_TOKEN="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SessionToken"])')"

# CREDENTIALS_FILE es más estable que ENVIRONMENT_VARIABLES dentro del proceso Komiser
umask 077
cat >"${CREDS_FILE}" <<EOF
[default]
aws_access_key_id = ${AWS_ACCESS_KEY_ID}
aws_secret_access_key = ${AWS_SECRET_ACCESS_KEY}
aws_session_token = ${AWS_SESSION_TOKEN}
region = ${AWS_REGION}
EOF

# Quitar env STS del shell para que el task role no se mezcle; Komiser lee el profile file
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || true

cat >"${CONFIG_TOML}" <<EOF
[[aws]]
name = "trackaws-${ACCOUNT_ID}"
source = "CREDENTIALS_FILE"
path = "${CREDS_FILE}"
profile = "default"

[sqlite]
file = "${DB_FILE}"
EOF

echo "[komiser-fargate] Starting Komiser regions=${REGIONS} port=${KOMISER_PORT}"
set +e
komiser start \
  --config "${CONFIG_TOML}" \
  --port "${KOMISER_PORT}" \
  --regions "${REGIONS}" \
  >"${WORK_DIR}/komiser.log" 2>&1 &
KOMISER_PID=$!
set -e

sleep 3
if ! kill -0 "${KOMISER_PID}" 2>/dev/null; then
  die "komiser process died. Log: $(tail -c 2500 "${WORK_DIR}/komiser.log" 2>/dev/null || true)"
fi

# Esperar HTTP listo
for _ in $(seq 1 30); do
  if curl -sf -m 2 "http://127.0.0.1:${KOMISER_PORT}/stats" >/dev/null 2>&1 \
    || curl -sf -m 2 "http://127.0.0.1:${KOMISER_PORT}/is_onboarded" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

fetch_page() {
  local skip="$1"
  curl -sS -m 30 -X POST \
    "http://127.0.0.1:${KOMISER_PORT}/resources/search?limit=${PAGE_LIMIT}&skip=${skip}" \
    -H "Content-Type: application/json" \
    -d '[]'
}

count_resources() {
  python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print(0); raise SystemExit
if isinstance(d, list):
    print(len(d))
elif isinstance(d, dict):
    for k in ("data", "resources", "items", "result"):
        if isinstance(d.get(k), list):
            print(len(d[k])); raise SystemExit
    print(int(d.get("count") or d.get("total") or 0))
else:
    print(0)
'
}

echo "[komiser-fargate] Waiting for inventory via /resources/search (timeout=${SCAN_TIMEOUT_SEC}s)"
deadline=$((SECONDS + SCAN_TIMEOUT_SEC))
ready=0
STABLE_HITS=0
LAST_COUNT=-1
while [ "${SECONDS}" -lt "${deadline}" ]; do
  if ! kill -0 "${KOMISER_PID}" 2>/dev/null; then
    die "komiser crashed during scan. Log: $(tail -c 2500 "${WORK_DIR}/komiser.log" 2>/dev/null || true)"
  fi

  set +e
  RESP="$(fetch_page 0 2>"${WORK_DIR}/curl.err")"
  CURL_RC=$?
  set -e
  COUNT=0
  if [ "${CURL_RC}" -eq 0 ] && [ -n "${RESP}" ]; then
    COUNT="$(printf '%s' "${RESP}" | count_resources)"
  fi
  echo "[komiser-fargate] poll resources≈${COUNT}"

  if [ "${COUNT}" -ge "${MIN_RESOURCES}" ]; then
    # Esperar a que el contador se estabilice 2 polls (scan sigue insertando)
    if [ "${COUNT}" -eq "${LAST_COUNT}" ]; then
      STABLE_HITS=$((STABLE_HITS + 1))
    else
      STABLE_HITS=0
    fi
    LAST_COUNT="${COUNT}"
    if [ "${STABLE_HITS}" -ge 2 ] || [ "${SECONDS}" -gt $((deadline - 30)) ]; then
      printf '%s' "${RESP}" >"${REPORT_JSON}.page0"
      ready=1
      break
    fi
  fi
  sleep "${POLL_INTERVAL_SEC}"
done

if [ "${ready}" -ne 1 ]; then
  # Fallback: CSV export si hay algo en DB
  set +e
  curl -sS -m 60 "http://127.0.0.1:${KOMISER_PORT}/resources/export-csv" \
    -o "${WORK_DIR}/inventory.csv" 2>"${WORK_DIR}/csv.err"
  CSV_RC=$?
  set -e
  if [ "${CSV_RC}" -eq 0 ] && [ -s "${WORK_DIR}/inventory.csv" ]; then
    echo "[komiser-fargate] fallback CSV export ($(wc -c <"${WORK_DIR}/inventory.csv") bytes)"
    python3 - "${REPORT_JSON}" "${WORK_DIR}/inventory.csv" "${TENANT_ID}" "${AUDIT_ID}" "${ACCOUNT_ID}" <<'PY'
import csv, json, sys
from datetime import datetime, timezone
out_path, csv_path, tenant_id, audit_id, account_id = sys.argv[1:6]
with open(csv_path, newline="", encoding="utf-8") as fh:
    rows = list(csv.DictReader(fh))
payload = {
    "engine": "komiser-fargate",
    "exportedAtIso": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "tenantId": tenant_id,
    "auditId": audit_id,
    "accountId": account_id,
    "resourceCount": len(rows),
    "source": "export-csv",
    "resources": rows,
}
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
print(f"[komiser-fargate] packed csv resources={len(rows)}")
PY
  else
    die "inventory timeout or empty (min=${MIN_RESOURCES}). Log: $(tail -c 2000 "${WORK_DIR}/komiser.log" 2>/dev/null || true)"
  fi
else
  # Paginar si page0 está llena
  python3 - "${REPORT_JSON}" "${REPORT_JSON}.page0" "${TENANT_ID}" "${AUDIT_ID}" "${ACCOUNT_ID}" "${KOMISER_PORT}" "${PAGE_LIMIT}" <<'PY'
import json, sys, urllib.request
from datetime import datetime, timezone

out_path, page0_path, tenant_id, audit_id, account_id, port, page_limit = sys.argv[1:8]
page_limit = int(page_limit)

def as_list(raw):
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for k in ("data", "resources", "items", "result"):
            if isinstance(raw.get(k), list):
                return raw[k]
    return []

def fetch(skip: int):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/resources/search?limit={page_limit}&skip={skip}",
        data=b"[]",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return as_list(json.loads(resp.read().decode("utf-8")))

resources = as_list(json.loads(open(page0_path, encoding="utf-8").read()))
skip = len(resources)
# Más páginas mientras la última venga completa
while len(resources) >= skip and skip > 0:
    # si page0 no llenó el límite, no hay más
    if skip < page_limit and skip == len(resources):
        break
    batch = fetch(skip)
    if not batch:
        break
    resources.extend(batch)
    if len(batch) < page_limit:
        break
    skip = len(resources)
    if skip > 50000:
        break

payload = {
    "engine": "komiser-fargate",
    "exportedAtIso": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "tenantId": tenant_id,
    "auditId": audit_id,
    "accountId": account_id,
    "resourceCount": len(resources),
    "source": "resources/search",
    "resources": resources,
}
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
print(f"[komiser-fargate] packed resources={len(resources)} → {out_path}")
PY
fi

[ -s "${REPORT_JSON}" ] || die "report json empty"

restore_task_credentials

aws s3 cp "${REPORT_JSON}" "s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}" \
  --content-type "application/json" \
  --sse AES256 \
  || die "s3 put failed s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"

echo "[komiser-fargate] Uploaded s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"
exit 0
