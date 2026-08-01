# Track_AWS

SaaS B2B de auditoría AWS autónoma (FinOps + SecOps/Prowler + WAF scores).

Nx monorepo · Hexagonal · AppSync · Step Functions · Lambda · **Prowler Fargate** · DynamoDB.

## Stack

- **Frontend:** Angular 17 standalone + Ionic + Signals (`apps/track-aws-web`)
- **Libs:** `@track-aws/{common,domain,application,infrastructure}`
- **Lambdas:** `lambda_code/` (API, audit pipeline, FinOps SQS legacy)
- **Prowler:** `integrations/prowler-fargate/` → ECR → **ECS Fargate**
- **Alertas:** EventBridge digest → SNS + webhooks/Slack por tenant
- **IaC:** Terraform (`infra/`)

## Flujo

1. Settings → conectar cuenta (AssumeRole + ExternalId + CFN) + canales de alerta
2. `startAudit` → Step Functions
3. Paralelo: CloudQuery (Lambda) ∥ Prowler (Fargate → S3)
4. Aggregate → DynamoDB + AppSync + **digest de alertas** (seguridad / ahorro / inconsistencias)

## Quick start

```bash
npm install
cp .env.example .env
npm run sync:env
ECR_URL=$(terraform -chdir=infra output -raw prowler_ecr_repository_url)
AWS_REGION=eu-central-1 ECR_URL="$ECR_URL" ./integrations/prowler-fargate/push-image.sh
npm run start:web
```

## Docs

- `PROYECTO_VISION.md`
- `.cursorrules` / `.cursor/rules/`
- `integrations/prowler-fargate/README.md`
- `integrations/connect-account/README.md`
