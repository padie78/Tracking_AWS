# Modelo de datos FinOps (single-table)

## Prefijos

| Entidad | PK | SK |
|---|---|---|
| Tenant profile | `TENANT#<tenantId>` | `PROFILE` |
| Membership | `TENANT#<tenantId>` | `MEMBER#<userId>` |
| Account link | `TENANT#<tenantId>` | `ACCOUNT#<accountId>` |
| Scan job | `TENANT#<tenantId>` | `SCAN#<scanId>` |
| Finding | `TENANT#<tenantId>#SCAN#<scanId>` | `FINDING#<category>#<findingId>` |
| Dossier | `TENANT#<tenantId>` | `DOSSIER#<dossierId>` |
| Subscription | `TENANT#<tenantId>` | `SUBSCRIPTION` |

## GSI1

- `GSI1PK = TENANT#<tenantId>#CATEGORY#<rightsizing|modernization|orphaned>`
- `GSI1SK = <createdAtIso>#<findingId>`

## TTL

Findings pueden llevar atributo `ttl` (epoch) para retención efímera de metadata operacional.
