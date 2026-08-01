#!/usr/bin/env bash
# Crea (o reutiliza) el OIDC provider de GitHub Actions y un rol IAM para CI/CD.
# Uso:
#   ./scripts/setup-github-oidc.sh
#   ./scripts/setup-github-oidc.sh --repo OWNER/Track_AWS --role-name track-aws-github-deploy
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-}"
ROLE_NAME="${ROLE_NAME:-track-aws-github-deploy}"
AWS_REGION="${AWS_REGION:-eu-central-1}"
OIDC_URL="https://token.actions.githubusercontent.com"
OIDC_AUDIENCE="sts.amazonaws.com"
# Thumbprints oficiales de GitHub Actions (AWS acepta lista)
GITHUB_OIDC_THUMBPRINTS=(
  "${GITHUB_OIDC_THUMBPRINT:-6938fd4d98bab03faadb97b34396831e3780aea1}"
  "1c58a3a8518e8759bf075b76b750d4c4df28b48a"
)

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) GITHUB_REPO="$2"; shift 2 ;;
    --role-name) ROLE_NAME="$2"; shift 2 ;;
    --region) AWS_REGION="$2"; shift 2 ;;
    -h|--help)
      echo "Uso: $0 --repo ORG/REPO [--role-name NAME] [--region REGION]"
      exit 0
      ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

if [ -z "${GITHUB_REPO}" ]; then
  echo "Error: pasá --repo ORG/REPO (ej. --repo mi-org/Track_AWS)." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: AWS CLI no instalado." >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "==> Cuenta AWS: ${ACCOUNT_ID}"
echo "==> Repositorio GitHub: ${GITHUB_REPO}"

# 1. OIDC provider (idempotente)
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_ARN}" >/dev/null 2>&1; then
  echo "==> OIDC provider ya existe: ${OIDC_ARN}"
else
  echo "==> Creando OIDC provider de GitHub Actions..."
  aws iam create-open-id-connect-provider \
    --url "${OIDC_URL}" \
    --client-id-list "${OIDC_AUDIENCE}" \
    --thumbprint-list "${GITHUB_OIDC_THUMBPRINTS[@]}" \
    --tags Key=Project,Value=track-aws Key=ManagedBy,Value=setup-github-oidc
  echo "==> OIDC provider creado."
fi

# 2. Trust policy del rol
TRUST_FILE="$(mktemp)"
cat > "${TRUST_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "${OIDC_ARN}"
      },
      "Action": [
        "sts:AssumeRoleWithWebIdentity",
        "sts:TagSession"
      ],
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "${OIDC_AUDIENCE}"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo "==> Actualizando trust policy del rol ${ROLE_NAME}..."
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "file://${TRUST_FILE}"
else
  echo "==> Creando rol ${ROLE_NAME}..."
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "file://${TRUST_FILE}" \
    --description "GitHub Actions deploy role for ${GITHUB_REPO}" \
    --tags Key=Project,Value=track-aws Key=ManagedBy,Value=setup-github-oidc
fi
rm -f "${TRUST_FILE}"

# 3. Permisos (PoC: PowerUser; en prod usar política mínima)
echo "==> Adjuntando PowerUserAccess (PoC)..."
aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/PowerUserAccess" 2>/dev/null || true

echo ""
echo "=============================================="
echo "ROL LISTO"
echo "ARN: ${ROLE_ARN}"
echo "=============================================="
echo ""
echo "Configurá en GitHub → Settings → Secrets and variables → Actions:"
echo ""
echo "  Secret:  AWS_DEPLOY_ROLE_ARN"
echo "  Valor:   ${ROLE_ARN}"
echo ""
if command -v gh >/dev/null 2>&1; then
  echo "Con GitHub CLI (desde el repo):"
  echo "  gh secret set AWS_DEPLOY_ROLE_ARN --body '${ROLE_ARN}'"
  echo ""
fi
echo "Variables recomendadas (Settings → Variables):"
echo "  TF_STATE_BUCKET     → output de: cd infra/bootstrap && terraform output -raw state_bucket"
echo "  TF_STATE_LOCKS_TABLE → track-aws-tf-locks (o tu tabla de locks)"
echo "  AWS_REGION          → ${AWS_REGION}"
echo "  TF_STATE_KEY        → dev/terraform.tfstate"
echo ""
echo "Secret opcional:"
echo "  SCAN_INGESTION_SECRET → secreto para POST /scan (header x-scan-secret)"
echo ""
echo "NOTA: Si la org GitHub usa 'custom OIDC subject claims' (sub con @ids),"
echo "  el trust debe matchear p.ej. repo:ORG@ID/REPO@ID:*"
echo "  Revisá CloudTrail AssumeRoleWithWebIdentity → userName."
