#!/usr/bin/env bash
# Trivy Fargate — AssumeRole → ECR image scan → normalize → S3 (task role)
# AWS vía boto3 (aws_ops.py), no awscli Alpine.
set -euo pipefail

: "${ROLE_ARN:?ROLE_ARN required}"
: "${EXTERNAL_ID:?EXTERNAL_ID required}"
: "${ACCOUNT_ID:?ACCOUNT_ID required}"
: "${TENANT_ID:?TENANT_ID required}"
: "${AUDIT_ID:?AUDIT_ID required}"
: "${OUTPUT_BUCKET:?OUTPUT_BUCKET required}"
: "${AWS_REGION:=eu-central-1}"

OUTPUT_KEY="${OUTPUT_KEY:-tenants/${TENANT_ID}/audits/${AUDIT_ID}/trivy/findings.json}"
WORK_DIR="${WORK_DIR:-/tmp/trivy-out}"
MAX_IMAGES="${MAX_IMAGES:-8}"
AWS_OPS="${AWS_OPS:-/opt/trackaws/aws_ops.py}"
mkdir -p "${WORK_DIR}"

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

echo "[trivy-fargate] Assuming role ${ROLE_ARN}"
CREDS_JSON="$(python3 "${AWS_OPS}" assume-role \
  --role-arn "${ROLE_ARN}" \
  --external-id "${EXTERNAL_ID}" \
  --session-name "trivy-${AUDIT_ID:0:40}" \
  --region "${AWS_REGION}")"

export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN
AWS_ACCESS_KEY_ID="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["AccessKeyId"])')"
AWS_SECRET_ACCESS_KEY="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["SecretAccessKey"])')"
AWS_SESSION_TOKEN="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["SessionToken"])')"
unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || true

set +e
python3 "${AWS_OPS}" ecr-login --registry "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" \
  2>&1 | tee "${WORK_DIR}/ecr-login.log"
set -e

echo "[trivy-fargate] Listing ECR repositories"
python3 "${AWS_OPS}" list-repos --out "${WORK_DIR}/repos.json"

python3 <<'PY' "${WORK_DIR}" "${MAX_IMAGES}" "${AWS_REGION}" "${ACCOUNT_ID}" "${AWS_OPS}"
import json, subprocess, sys
from pathlib import Path
work = Path(sys.argv[1])
max_images = int(sys.argv[2])
region = sys.argv[3]
account = sys.argv[4]
aws_ops = sys.argv[5]
repos = json.loads((work / "repos.json").read_text()).get("repositories") or []
scanned = 0
for repo in repos:
    if scanned >= max_images:
        break
    name = repo.get("repositoryName")
    if not name:
        continue
    try:
        imgs = subprocess.check_output(
            ["python3", aws_ops, "describe-images", "--repository", name],
            text=True,
        )
        details = json.loads(imgs).get("imageDetails") or []
        details.sort(key=lambda d: d.get("imagePushedAt") or "", reverse=True)
        tag = None
        digest = None
        for d in details:
            tags = d.get("imageTags") or []
            if tags:
                tag = tags[0]
                digest = d.get("imageDigest")
                break
            digest = d.get("imageDigest")
        if not digest and not tag:
            continue
        ref = f"{account}.dkr.ecr.{region}.amazonaws.com/{name}"
        ref = f"{ref}:{tag}" if tag else f"{ref}@{digest}"
        out = work / f"trivy-{scanned}.json"
        print(f"[trivy-fargate] Scanning {ref}")
        subprocess.run(
            ["trivy", "image", "--quiet", "--format", "json", "--output", str(out), "--severity", "CRITICAL,HIGH,MEDIUM", ref],
            check=False,
        )
        scanned += 1
    except Exception as exc:  # noqa: BLE001
        print(f"[trivy-fargate] skip {name}: {exc}")
print(f"[trivy-fargate] scanned_images={scanned}")
PY

python3 /opt/trackaws/normalize_trivy.py \
  --work-dir "${WORK_DIR}" \
  --tenant-id "${TENANT_ID}" \
  --audit-id "${AUDIT_ID}" \
  --account-id "${ACCOUNT_ID}" \
  --out "${WORK_DIR}/findings.json"

# Upload con task role (no con el rol del cliente)
restore_task_credentials

python3 "${AWS_OPS}" s3-put \
  --bucket "${OUTPUT_BUCKET}" \
  --key "${OUTPUT_KEY}" \
  --file "${WORK_DIR}/findings.json" \
  --content-type "application/json" \
  --sse AES256

echo "[trivy-fargate] Uploaded s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"
exit 0
