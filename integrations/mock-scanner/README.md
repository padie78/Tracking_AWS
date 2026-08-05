# Mock scanner

Simula el pipeline de audit **sin Fargate**: deja 5 artefactos en S3 y dispara
`aggregate-audit` → `business-etl-aggregator` con el mismo contrato que Step Functions.

## Fixtures

| # | Archivo | Motor |
|---|---------|--------|
| 01 | `fixtures/01-cloudquery-finops.json` | CloudQuery / FinOps |
| 02 | `fixtures/02-prowler-secops.json` | Prowler / SecOps |
| 03 | `fixtures/03-trivy-appsec.json` | Trivy / AppSec |
| 04 | `fixtures/04-komiser-inventory.json` | Komiser |
| 05 | `fixtures/05-infracost-lines.json` | Infracost |

Keys en S3 (`PROWLER_FINDINGS_BUCKET`):

```
tenants/{tenantId}/audits/{auditId}/cloudquery/findings.json
tenants/{tenantId}/audits/{auditId}/prowler/findings.json
tenants/{tenantId}/audits/{auditId}/trivy/findings.json
tenants/{tenantId}/audits/{auditId}/komiser/findings.json
tenants/{tenantId}/audits/{auditId}/infracost/lines.json
```

## UI

Dashboard → **Simular scanner** → mutation GraphQL `simulateMockScan`.

## CLI

```bash
node scripts/simulate-mock-scan.mjs --tenant demo --account 473959757331
```
