# Track_AWS — Autonomous Cloud Audit (visión)

SaaS B2B PLG multitenant: conectar cuentas AWS (`sts:AssumeRole` + ExternalId), inventariar y auditar FinOps + SecOps + Well-Architected de forma asíncrona.

**Compute:** Lambdas + **ECS Fargate para Prowler**. Orquestación: Step Functions `Parallel`.

## Flujo

1. Angular → AppSync (JWT `custom:tenant_id` **inmutable**) → `startAudit`
2. Step Functions: resolve → paralelo **CloudQuery(Lambda)** ∥ **Prowler(Fargate→S3)** → load → aggregate
3. Digest de alertas al cliente (seguridad / tips de ahorro / inconsistencias) vía EventBridge + SNS + webhooks
4. AppSync subscription actualiza UI; reportes en S3

## Stack

Terraform · Angular 17 standalone/Signals · Lambda TS · ECS Fargate (Prowler) · AppSync · Cognito · DynamoDB STD · EventBridge/SNS · S3/CloudFront
