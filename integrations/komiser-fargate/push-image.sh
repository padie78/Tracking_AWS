#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REGION="${AWS_REGION:-eu-central-1}"
TAG="${KOMISER_IMAGE_TAG:-latest}"
ECR_URL="${ECR_URL:?Set ECR_URL to terraform output komiser_ecr_repository_url}"

aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URL%/*}"

docker build -t "${ECR_URL}:${TAG}" "${ROOT}/integrations/komiser-fargate"
docker push "${ECR_URL}:${TAG}"
echo "Pushed ${ECR_URL}:${TAG}"
