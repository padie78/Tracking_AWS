# Conectar cuenta AWS (cross-account AssumeRole)

1. Settings → `linkAwsAccount` (External ID + CloudFormation URL).
2. Desplegá `customer-role.yaml` (SecurityAudit + métricas) en la cuenta cliente.
3. `verifyAwsAccountLink` → **Start audit**.
4. Step Functions: CloudQuery (Lambda) ∥ **Prowler (Fargate)** → aggregate.

Ver también `../prowler-fargate/README.md`.
