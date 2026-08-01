#!/usr/bin/env bash
# Prowler Fargate entrypoint — AssumeRole + scan + normalize → S3
set -euo pipefail

: "${ROLE_ARN:?ROLE_ARN required}"
: "${EXTERNAL_ID:?EXTERNAL_ID required}"
: "${ACCOUNT_ID:?ACCOUNT_ID required}"
: "${TENANT_ID:?TENANT_ID required}"
: "${AUDIT_ID:?AUDIT_ID required}"
: "${OUTPUT_BUCKET:?OUTPUT_BUCKET required}"
: "${AWS_REGION:=us-east-1}"

REGIONS="${REGIONS:-us-east-1}"
OUTPUT_KEY="${OUTPUT_KEY:-tenants/${TENANT_ID}/audits/${AUDIT_ID}/prowler/findings.json}"
WORK_DIR="${WORK_DIR:-/tmp/prowler-out}"
mkdir -p "${WORK_DIR}"

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

# Quitar credenciales del task role para que Prowler use solo la sesión assumed
unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || true

IFS=',' read -r -a REGION_LIST <<< "${REGIONS}"

echo "[prowler-fargate] Running Prowler regions=${REGIONS}"
# Prowler 4.x CLI — JSON-OCSF / json-asff según versión; normalizamos después
set +e
prowler aws \
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

aws s3 cp "${WORK_DIR}/findings.json" "s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}" \
  --content-type "application/json" \
  --sse AES256

echo "[prowler-fargate] Uploaded s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"
# Exit 0 para que Step Functions ecs:runTask.sync no falle por findings CRITICAL
exit 0
