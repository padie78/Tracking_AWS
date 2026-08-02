# Application layer

Casos de uso hexagonales (audit, accounts, inventory, alerts).

Flujo activo:

```
startAudit → Step Functions (CloudQuery ∥ Prowler ∥ Trivy) → aggregate → Dynamo/S3
```
