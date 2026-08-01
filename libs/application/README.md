# @track-aws/application

Capa de aplicación — orquestadores (use cases), DTOs Zod, puertos hexagonales y mappers.

## Dependencias permitidas

- `@track-aws/domain`
- `@track-aws/common`

**No** importar `@track-aws/infrastructure`.

## Estructura

```
src/lib/
├── contracts/     # Tipos AppSync (subscriptions, mutations)
├── dto/
│   ├── scan/            # Mensajes SQS de escaneo
│   ├── findings/        # Findings agregados
│   └── dossier/         # Dossier de ahorro IA
├── mappers/       # Entity ↔ DTO
├── ports/
│   ├── shared/          # ILogger, IIdGenerator
│   ├── mcp/             # IMcpAwsInventoryPort (efímero)
│   ├── scan/            # Colas y repositorio de ScanJob
│   ├── findings/        # Persistencia + notificaciones
│   └── dossier/         # Generador IA + persistencia
└── use-cases/
    ├── scan/            # Enqueue + Process inventory scan
    ├── rightsizing/     # Detect oversized EC2
    ├── modernization/   # Recommend instance modernization
    ├── orphaned/        # Detect orphaned EBS/EIP
    └── dossier/         # Generate savings dossier
```

## Flujo FinOps (MVP)

```
startScan → EnqueueInventoryScanUseCase → SQS(scan)
SQS → ProcessInventoryScanUseCase → MCP (in-memory) → fan-out analyzers
SQS → DetectOversizedEc2 / RecommendModernization / DetectOrphaned → DynamoDB + AppSync
SQS → GenerateSavingsDossierUseCase → Bedrock → DynamoDB + AppSync
Query → ListFindings / GetDossier
```
