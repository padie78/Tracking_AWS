# Track_AWS — Visión Enterprise (Time-Travel · Event-Driven · Proactivo)

SaaS B2B para usuarios no técnicos (Pymes, Startups, C-Level). La plataforma **no es solo reactiva**: combina escaneos bajo demanda con arquitecturas event-driven que emiten alertas, comentarios y sugerencias prescriptivas de ciberseguridad, FinOps y AppSec en tiempo casi real.

**Requisito core:** *Time-Travel Diagnostics* — el usuario elige una fecha en el selector global y ve el estado exacto (inventario, topología, costos, vulnerabilidades, cumplimiento) en ese punto del pasado.

**Motores:** Prowler (SecOps) · CloudQuery-style inventory/FinOps · Trivy (AppSec, roadmap) · Infracost (costos futuros, roadmap).

---

## Stack de implementación (fuente de verdad hoy)

| Capa | Hoy | Norte (sin reescritura big-bang) |
|---|---|---|
| Frontend | Angular 17+ standalone + Signals + Ionic | + Selector de tiempo global · Vista Simple/Avanzada · `@swimlane/ngx-graph` |
| API | AppSync GraphQL + Cognito JWT | Mismos contratos; queries `asOf` / snapshot |
| Compute | Lambda **TypeScript** hexagonal (Nx) + ECS Fargate (Prowler) | Step Functions + Distributed Map; workers Athena/Parquet (TS o Python wrangler solo si se introduce explícitamente) |
| Datos calientes | DynamoDB single-table `TENANT#<id>` | + `Dashboard-Cache` (SK = fecha_escaneo) |
| Datos fríos / histórico | S3 reportes | S3 Parquet Hive inmutable + Glue + Athena point-in-time |
| Proactividad | EventBridge digests + SNS/webhooks | + CloudTrail/Config/Cost Anomaly del cliente → Lambdas inmediatas |
| IaC | Terraform modular | Igual |

**Privacidad:** AssumeRole STS en memoria; no persistir dumps crudos ni access keys. Secrets de IA/tooling → SSM Parameter Store (`SecureString`). ARNs/webhooks → Dynamo como metadata operativa.

**Multitenant absoluto:** `tenant_id` solo desde JWT Cognito (`custom:tenant_id`). Prohibido aceptar `tenantId` mutable del cliente.

---

## Módulos frontend (cada uno reacciona al Selector de Tiempo Global)

| # | Módulo | Capacidad |
|---|---|---|
| 1 | Cuadro de mando | KPIs as-of fecha; score 1–100 histórico; tendencia factura 90d; resumen ejecutivo IA |
| 2 | Centro de seguridad | Prowler (+ Trivy roadmap); qué existía / se remedió; alertas push |
| 3 | Cumplimiento | ISO 27001 / SOC2 / PCI-DSS; justificaciones IA; evidencias S3 Object Lock |
| 4 | FinOps histórico | Costos/anomalías; ahorro mes a mes por playbooks |
| 5 | Inventario + topología | Mapa ngx-graph rebobinable; drift detection entre dos fechas |
| 6 | Cyber Risk Twin | Vectores de ataque predictivos (roadmap) |
| 7 | Copilot | RAG sobre data lake (roadmap) |
| 8 | Playbooks Hub | 1-clic, smart scheduling, ROI PDF ejecutivo |
| 9 | Ajustes B2B | Multi-cuenta, integraciones, políticas horarias, RBAC |

**Conmutador de vista:** Simple (ejecutiva) / Avanzada (técnica). El rol puede forzar Simple (p. ej. AUDITOR).

---

## RBAC SaaS (norte) ↔ roles actuales Cognito

| Norte | Cognito hoy (compat) | Permisos clave |
|---|---|---|
| `OWNER` | `finops_admin` (+ billing futuro) | Suite completa, cuentas, usuarios, playbooks globales, facturación SaaS |
| `ADMIN` | `finops_admin` | Integraciones, excepciones, scans manuales; **sin** facturación SaaS ni borrar cuentas raíz |
| `DEVELOPER` | `analyst` | Vista avanzada; findings; grafo; playbooks pre-aprobados; opcional `cuentas_asignadas[]` |
| `AUDITOR` | `viewer` | Solo lectura; vista simple forzada; scores/reportes firmados; **sin** playbooks ni código |

Migración: claims `custom:user_role` evolucionan a los 4 valores norte; UI y resolvers validan matriz de permisos.

---

## Datos: inmutabilidad (cold path — etapa actual)

1. Cada ejecución profunda escribe Parquet **append-only** en el bucket data-lake:

```
s3://{data_lake}/cloudquery/tenant_id={12}/anio={YYYY}/mes={MM}/cloudquery_{12}_{YYYYMMDD-HHMM}.parquet
s3://{data_lake}/prowler/tenant_id={12}/anio={YYYY}/mes={MM}/prowler_{12}_{YYYYMMDD-HHMM}.parquet
s3://{data_lake}/trivy/tenant_id={12}/anio={YYYY}/mes={MM}/trivy_{12}_{YYYYMMDD-HHMM}.parquet
s3://{data_lake}/infracost/tenant_id={12}/anio={YYYY}/mes={MM}/infracost_{12}_{YYYYMMDD-HHMM}.parquet
```

- En estas keys, `tenant_id` = **AWS Account ID (12 dígitos)**. El tenant Cognito va en columna `org_tenant_id` del Parquet.
- **Prohibido sobrescribir** escaneos anteriores (nuevo `filename_prefix` por minuto UTC).
- Dev: lifecycle expira esos prefijos a los **7 días**. Prod: `expire_days = 0`.
- Athena / Dashboard-Cache / selector `asOf` = **etapa siguiente** (análisis).

---

## Insights de IA (obligatorio en alertas/ROI)

Comparar foto actual vs foto histórica inmediata anterior. Mensaje:
1. **Impacto de negocio** (USD en riesgo, probabilidad, score Δ).
2. **Acción prescriptiva** (pasos o deep-link a Playbook 1-clic).

Tono: sin jerga innecesaria en Vista Simple; glosario AWS fiel en Vista Avanzada. Markdown limpio, sin saludos.

---

## E. Formato de grafo semántico e inventario rebobinable

Payload canónico que consume `@swimlane/ngx-graph` (y el panel de drift). Toda reconstrucción as-of fecha debe devolver este shape (desde cache o Athena).

### Principios

- **Nodos** = recursos AWS (o agregados lógicos).  
- **Edges** = relaciones de red/datos/identidad observadas en ese timestamp.  
- Separar visualmente **Serverless** vs **No Serverless** (`computeClass`).  
- Salud del nodo (`health`) deriva de findings abiertos as-of esa fecha (CRITICAL/HIGH → `critical`/`degraded`).  
- IDs estables: preferir ARN; si no hay ARN, `type:region:resourceId`.

### `TopologySnapshot`

```ts
interface TopologySnapshot {
  tenantId: string;
  accountId: string;           // 12 dígitos
  asOfIso: string;             // fecha pedida por el selector
  capturedAtIso: string;       // timestamp real del escaneo usado (≤ asOf)
  source: 'cache' | 'athena' | 'live';
  summary: {
    nodeCount: number;
    edgeCount: number;
    serverlessCount: number;
    nonServerlessCount: number;
    criticalNodeCount: number;
  };
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  drift?: DriftReport | null;  // solo si el cliente pide fromIso+toIso
}
```

### Nodo

```ts
type ComputeClass = 'serverless' | 'non_serverless' | 'network' | 'data' | 'identity' | 'other';
type NodeHealth = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'stopped';

interface TopologyNode {
  id: string;                  // ARN o clave estable
  label: string;               // nombre corto UI
  resourceType: string;        // ec2 | lambda | s3 | rds | sg | vpc | elb | …
  computeClass: ComputeClass;
  region: string;              // o 'global'
  state: string;               // running | stopped | active | …
  health: NodeHealth;
  estimatedMonthlyCostUsd: number;
  tags?: Record<string, string>;
  meta?: {
    findingIds?: string[];     // findings abiertos as-of
    linkedUser?: string;       // último actor CloudTrail si conocido
  };
}

/** Clasificación orientativa */
// serverless:      lambda, ecs-service (Fargate), dynamodb, sqs, sns, api-gateway, stepfunctions, …
// non_serverless:  ec2, rds, elb, nat, eks (nodos), elasticache, …
// network:         vpc, subnet, sg, tgw, …
// data:            s3, ebs, efs, glacier, …
// identity:        iam-user, iam-role, …
```

### Edge

```ts
type EdgeKind =
  | 'network'      // SG / VPC path
  | 'data'         // lee/escribe bucket, cola, tabla
  | 'identity'     // role asumible / instancia profile
  | 'contains'     // VPC contains subnet; cluster contains service
  | 'depends_on';

interface TopologyEdge {
  id: string;
  source: string;              // node.id
  target: string;
  kind: EdgeKind;
  label?: string;
  bidirectional?: boolean;
}
```

### Drift Detection (entre `fromIso` y `toIso`)

```ts
interface DriftReport {
  fromIso: string;
  toIso: string;
  fromCapturedAtIso: string;
  toCapturedAtIso: string;
  changes: DriftChange[];
}

type DriftChangeType = 'created' | 'deleted' | 'modified' | 'state_changed' | 'edge_added' | 'edge_removed';

interface DriftChange {
  changeType: DriftChangeType;
  resourceArn: string;
  resourceType: string;
  summary: string;             // lenguaje de negocio + técnico corto
  actor?: string | null;       // IAM principal CloudTrail si existe
  detectedAtIso: string;
}
```

### API GraphQL (norte)

- `getTopologySnapshot(accountId, asOfIso): TopologySnapshot` — tenant solo del JWT.  
- `getTopologyDrift(accountId, fromIso, toIso): DriftReport`  
- Inventario tabular reutiliza el mismo `capturedAtIso` / catálogo multi-servicio (`listedResources`) alineado a los nodos del grafo.

### UX

- Mover el selector de tiempo → refetch snapshot → el mapa “rebobina”.  
- Vista Simple: agrega por `computeClass` / salud. Vista Avanzada: nodos individuales + drift panel.

---

## Flujo operativo actual (MVP que ya corre)

1. Angular → AppSync (JWT) → `startAudit`
2. Step Functions: resolve → Parallel CloudQuery(Lambda) ∥ Prowler(Fargate→S3) → aggregate
3. Digests EventBridge + SNS/webhooks
4. Subscriptions AppSync; informe en S3/Dynamo

**Siguiente capa (sin big-bang):** Parquet append-only + Dashboard-Cache + selector `asOf` + topology snapshot.
