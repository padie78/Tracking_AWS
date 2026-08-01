#!/usr/bin/env bash
# Build & push Prowler Lambda container image to ECR.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REGION="${AWS_REGION:-eu-central-1}"
TAG="${PROWLER_IMAGE_TAG:-latest}"
ECR_URL="${ECR_URL:?Set ECR_URL to terraform output prowler_ecr_repository_url}"

aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URL%/*}"

docker build --platform linux/arm64 -t "${ECR_URL}:${TAG}" "${ROOT}/integrations/prowler-lambda"
docker push "${ECR_URL}:${TAG}"
echo "Pushed ${ECR_URL}:${TAG}"

if [[ -n "${PROWLER_FUNCTION_NAME:-}" ]]; then
  aws lambda update-function-code \
    --region "${REGION}" \
    --function-name "${PROWLER_FUNCTION_NAME}" \
    --image-uri "${ECR_URL}:${TAG}"
  aws lambda wait function-updated --function-name "${PROWLER_FUNCTION_NAME}" --region "${REGION}"
  echo "Updated Lambda ${PROWLER_FUNCTION_NAME}"
fi
