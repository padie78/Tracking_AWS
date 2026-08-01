#!/usr/bin/env bash
# Build & push Prowler Fargate image to ECR.
# Uso:
#   AWS_REGION=eu-central-1 \
#   ECR_URL=$(terraform -chdir=infra output -raw prowler_ecr_repository_url) \
#   ./integrations/prowler-fargate/push-image.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REGION="${AWS_REGION:-eu-central-1}"
TAG="${PROWLER_IMAGE_TAG:-latest}"
ECR_URL="${ECR_URL:?Set ECR_URL to the terraform output prowler_ecr_repository_url}"

aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URL%/*}"

docker build -t "${ECR_URL}:${TAG}" "${ROOT}/integrations/prowler-fargate"
docker push "${ECR_URL}:${TAG}"
echo "Pushed ${ECR_URL}:${TAG}"
