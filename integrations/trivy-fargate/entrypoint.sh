#!/usr/bin/env bash
# Trivy Fargate — AssumeRole → ECR image scan → normalize → S3 (task role)
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
mkdir -p "${WORK_DIR}"

SAVED_CONTAINER_CREDS_URI="${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:-}"

restore_task_credentials() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN || true
  if [ -n "${SAVED_CONTAINER_CREDS_URI}" ]; then
    export AWS_CONTAINER_CREDENTIALS_RELATIVE_URI="${SAVED_CONTAINER_CREDS_URI}"
  fi
}

echo "[trivy-fargate] Assuming role ${ROLE_ARN}"
CREDS_JSON="$(aws sts assume-role \
  --role-arn "${ROLE_ARN}" \
  --role-session-name "trivy-${AUDIT_ID:0:40}" \
  --external-id "${EXTERNAL_ID}" \
  --duration-seconds 3600 \
  --output json)"

export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_SESSION_TOKEN
AWS_ACCESS_KEY_ID="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["AccessKeyId"])')"
AWS_SECRET_ACCESS_KEY="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SecretAccessKey"])')"
AWS_SESSION_TOKEN="$(echo "${CREDS_JSON}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Credentials"]["SessionToken"])')"
unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || true

# Login ECR en la cuenta cliente (si hay repos)
set +e
aws ecr get-login-password --region "${AWS_REGION}" \
  | trivy registry login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" 2>&1 \
  | tee "${WORK_DIR}/ecr-login.log"
set -e

echo "[trivy-fargate] Listing ECR repositories"
aws ecr describe-repositories --region "${AWS_REGION}" --output json > "${WORK_DIR}/repos.json" || echo '{"repositories":[]}' > "${WORK_DIR}/repos.json"

python3 <<'PY' "${WORK_DIR}" "${MAX_IMAGES}" "${AWS_REGION}" "${ACCOUNT_ID}"
import json, subprocess, sys
from pathlib import Path
work = Path(sys.argv[1])
max_images = int(sys.argv[2])
region = sys.argv[3]
account = sys.argv[4]
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
            ["aws", "ecr", "describe-images", "--repository-name", name, "--region", region, "--output", "json"],
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

restore_task_credentials

aws s3 cp "${WORK_DIR}/findings.json" "s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}" \
  --content-type "application/json" \
  --sse AES256

echo "[trivy-fargate] Uploaded s3://${OUTPUT_BUCKET}/${OUTPUT_KEY}"
exit 0
