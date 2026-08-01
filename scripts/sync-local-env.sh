#!/usr/bin/env bash
# Genera apps/track-aws-web/src/environments/environment.ts desde outputs de Terraform.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"
ENV_FILE="${ROOT_DIR}/apps/track-aws-web/src/environments/environment.ts"
AWS_REGION="${AWS_REGION:-eu-central-1}"

if ! command -v terraform >/dev/null 2>&1; then
  echo "Error: terraform no está instalado." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq no está instalado." >&2
  exit 1
fi

cd "${INFRA_DIR}"

if [ ! -d .terraform ]; then
  echo "Error: ejecutá 'terraform init' en infra/ antes de sync-local-env." >&2
  exit 1
fi

OUTPUTS="$(terraform output -json 2>/dev/null || true)"
if [ -z "${OUTPUTS}" ] || [ "${OUTPUTS}" = "{}" ]; then
  echo "Error: no hay outputs de Terraform. Ejecutá 'terraform apply' en infra/." >&2
  exit 1
fi

APPSYNC_ENDPOINT="$(echo "${OUTPUTS}" | jq -r '.appsync_endpoint.value // empty')"
APPSYNC_API_KEY="$(echo "${OUTPUTS}" | jq -r '.appsync_api_key.value // empty')"
COGNITO_POOL="$(echo "${OUTPUTS}" | jq -r '.cognito_user_pool_id.value // empty')"
COGNITO_CLIENT="$(echo "${OUTPUTS}" | jq -r '.cognito_web_client_id.value // empty')"
COGNITO_DOMAIN="$(echo "${OUTPUTS}" | jq -r '.cognito_domain.value // empty')"
SCAN_URL="$(echo "${OUTPUTS}" | jq -r '.scan_url.value // empty')"

if [ -z "${APPSYNC_ENDPOINT}" ] || [ -z "${APPSYNC_API_KEY}" ] || [ -z "${COGNITO_POOL}" ] || [ -z "${COGNITO_CLIENT}" ]; then
  echo "Error: faltan outputs requeridos (appsync_endpoint, appsync_api_key, cognito_user_pool_id, cognito_web_client_id)." >&2
  exit 1
fi

cat > "${ENV_FILE}" <<EOF
import type { AppRuntimeEnvironment } from './environment.types';

export const environment: AppRuntimeEnvironment = {
  production: false,
  appsync: {
    endpoint: '${APPSYNC_ENDPOINT}',
    region: '${AWS_REGION}',
    apiKey: '${APPSYNC_API_KEY}',
  },
  cognito: {
    userPoolId: '${COGNITO_POOL}',
    userPoolClientId: '${COGNITO_CLIENT}',
    domain: '${COGNITO_DOMAIN}',
    oauthRedirectSignIn: 'http://localhost:4200/auth/callback',
    oauthRedirectSignOut: 'http://localhost:4200/login',
  },
  scanIngestionUrl: '${SCAN_URL}',
};
EOF

echo "OK: ${ENV_FILE} actualizado."
echo ""
echo "=== Referencia rápida ==="
terraform output scan_url 2>/dev/null || true
terraform output frontend_url 2>/dev/null || true
