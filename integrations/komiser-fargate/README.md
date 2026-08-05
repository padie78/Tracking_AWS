# Komiser Fargate — integración Track_AWS
#
# Komiser CLI **no** tiene `komiser dashboard --export-json`.
# El entrypoint hace: AssumeRole → `komiser start` → export HTTP local → S3 → exit 0.
#
# Build/push:
#   ECR_URL=$(cd infra && terraform output -raw komiser_ecr_repository_url) \
#     ./integrations/komiser-fargate/push-image.sh
