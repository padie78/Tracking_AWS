# Prowler on ECS Fargate

Prowler corre en **Fargate** (no Lambda). Step Functions:

1. `ecs:runTask.sync` — contenedor asume el rol del cliente y escribe findings a S3  
2. `load_prowler_results` (Lambda) — lee el JSON normalizado  

## Build

```bash
ECR_URL=$(terraform -chdir=infra output -raw prowler_ecr_repository_url)
AWS_REGION=eu-central-1 ECR_URL="$ECR_URL" ./integrations/prowler-fargate/push-image.sh
```
