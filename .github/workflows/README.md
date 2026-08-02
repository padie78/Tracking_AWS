# CI/CD — Track_AWS

| Workflow | Trigger | Qué hace |
|----------|---------|----------|
| `deploy-infra.yml` | push en `infra/**` o manual | Terraform apply |
| `deploy-lambdas.yml` | push en `lambda_code/**` / `libs/**`, tras infra OK, o manual | esbuild + `update-function-code` |
| `deploy-prowler-image.yml` | push en `integrations/prowler-fargate/**`, tras infra, o manual | Docker build/push ECR Prowler |
| `deploy-trivy-image.yml` | push en `integrations/trivy-fargate/**`, tras infra, o manual | Docker build/push ECR Trivy |
| `deploy-frontend.yml` | push en `apps/track-aws-web/**` o manual | build Angular + S3 + CloudFront |

## Secrets y variables

### Secrets (obligatorio)

| Nombre | Descripción |
|--------|-------------|
| `AWS_DEPLOY_ROLE_ARN` | ARN del rol OIDC de deploy |

### Secrets (opcional)

Ninguno adicional por ahora (el pipeline HTTP `POST /scan` fue retirado).

### Variables (recomendadas tras bootstrap)

> Los workflows usan `environment: production`. Creá las Variables en  
> **Settings → Environments → production → Environment variables**  
> (o en Repository variables). Si `TF_STATE_BUCKET` falta, `deploy-infra`  
> intenta `track-aws-tfstate-<account_id>` (nombre default del bootstrap).

| Nombre | Ejemplo |
|--------|---------|
| `TF_STATE_BUCKET` | `track-aws-tfstate-473959757331` |
| `TF_STATE_LOCKS_TABLE` | `track-aws-tf-locks` |
| `AWS_REGION` | `eu-central-1` |
| `TF_STATE_KEY` | `dev/terraform.tfstate` |

```bash
cd infra/bootstrap && terraform output -raw state_bucket
# En GitHub UI: Environments → production → Add variable
```

## Orden del primer deploy

```text
1. infra/bootstrap/terraform apply
2. Configurar OIDC + secret AWS_DEPLOY_ROLE_ARN
3. Variables TF_STATE_* en GitHub
4. workflow_dispatch → Deploy Infrastructure
5. Deploy Prowler Image + Deploy Trivy Image (ECR → Fargate) — antes del primer audit
6. Deploy Lambdas (auto tras infra, o manual)
7. workflow_dispatch → Deploy Frontend
```
