#!/usr/bin/env bash
# Prowler Fargate entrypoint — AssumeRole + scan + normalize → S3 (task role)
set -euo pipefail

: "${ROLE_ARN:?ROLE_ARN required}"
: "${EXTERNAL_ID:?EXTERNAL_ID required}"
: "${ACCOUNT_ID:?ACCOUNT_ID required}"
: "${TENANT_ID:?TENANT_ID required}"
: "${AUDIT_ID:?AUDIT_ID required}"
: "${OUTPUT_BUCKET:?OUTPUT_BUCKET required}"
: "${AWS_REGION:=eu-central-1}"

# Imagen oficial: binario en el venv del user prowler (no está en PATH de root)
export PATH="/home/prowler/.venv/bin:/home/prowler/.local/bin:${PATH}"
PROWLER_BIN="${PROWLER_BIN:-}"
if [ -z "${PROWLER_BIN}" ]; then
  if command -v prowler >/dev/null 2>&1; then
    PROWLER_BIN="$(command -v prowler)"
  elif [ -x /home/prowler/.venv/bin/prowler ]; then
    PROWLER_BIN=/home/prowler/.venv/bin/prowler
  else
    echo "[prowler-fargate] ERROR: prowler binary not found" >&2
    exit 127
  fi
fi

REGIONS="${REGIONS:-eu-central-1}"
OUTPUT_KEY="${OUTPUT_KEY:-tenants/${TENANT_ID}/audits/${AUDIT_ID}/prowler/findings.json}"
WORK_DIR="${WORK_DIR:-/tmp/prowler-out}"
mkdir -p "${WORK_DIR}"

# Credenciales del task role ECS (para S3 PutObject al bucket de la plataforma)
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

echo "[prowler-fargate] Using ${PROWLER_BIN}"
echo "[prowler-fargate] Assuming role ${ROLE_ARN}"
CREDS_JSON="$(aws sts assume-role \
  --role-arn "${ROLE_ARN}" \
  --role-session-name "prowler-${AUDIT_ID:0:40}" \
  --external-id "${EXTERNAL_ID}" \
  --duration-seconds 3600 \
  --output json)"

export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN
AWS_ACCESS_KEY_ID="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["AccessKeyId"])')"
AWS_SECRET_ACCESS_KEY="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SecretAccessKey"])')"
AWS_SESSION_TOKEN="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SessionToken"])')"

# Evitar que el SDK mezcle credenciales del task role
unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || true

IFS=',' read -r -a REGION_LIST <<< "${REGIONS}"

echo "[prowler-fargate] Running Prowler regions=${REGIONS}"
set +e
"${PROWLER_BIN}" aws \
  --region "${REGION_LIST[@]}" \
  -M json-ocsf \
  -o "${WORK_DIR}" \
  --ignore-exit-code-3 \
  2>&1 | tee "${WORK_DIR}/prowler.log"
PROWLER_RC=$?
set -e

echo "[prowler-fargate] Prowler exit=${PROWLER_RC}"

python3 /opt/trackaws/normalize_prowler.py \
  --work-dir "${WORK_DIR}" \
  --tenant-id "${TENANT_ID}" \
  --audit-id "${AUDIT_ID}" \
  --account-id "${ACCOUNT_ID}" \
  --out "${WORK_DIR}/findings.json"

# Upload con task role (no con el rol del cliente)
restore_task_credentials

aws s3 cp "${WORK_DIR}/findings.json" "s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}" \
  --content-type "application/json" \
  --sse AES256

echo "[prowler-fargate] Uploaded s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"
exit 0
