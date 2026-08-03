import { PutCommand, QueryCommand, GetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  AuditJob,
  AuditFinding,
  type AuditStatus,
  type FindingDomain,
  type AuditSeverity,
  type WafPillarScores,
} from '@track-aws/domain';
import type {
  IAuditJobReader,
  IAuditJobWriter,
  IAuditFindingReader,
  IAuditFindingWriter,
} from '@track-aws/application';
import { DynamoKeys, EntityType } from '@track-aws/common';
import {
  auditDetailTtlEpochSeconds,
  auditJobTtlEpochSeconds,
} from '../retention/hot-retention';
import { getDocumentClient } from '../aws/dynamodb-client.factory';

function tableName(): string {
  const name = process.env['CORE_TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

export class DynamoDbAuditJobRepository
  implements IAuditJobWriter, IAuditJobReader
{
  private readonly doc = getDocumentClient();

  async save(audit: AuditJob): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          PK: DynamoKeys.tenantPk(audit.tenantId),
          SK: DynamoKeys.auditSk(audit.auditId),
          entityType: EntityType.AuditJob,
          tenantId: audit.tenantId,
          auditId: audit.auditId,
          accountId: audit.accountId,
          correlationId: audit.correlationId,
          status: audit.status,
          executionArn: audit.executionArn,
          createdAtIso: audit.createdAtIso,
          completedAtIso: audit.completedAtIso,
          findingCount: audit.findingCount,
          criticalCount: audit.criticalCount,
          highCount: audit.highCount,
          estimatedMonthlySavingsUsd: audit.estimatedMonthlySavingsUsd,
          globalScore: audit.globalScore,
          pillarScores: audit.pillarScores,
          errorMessage: audit.errorMessage,
          ttl: auditJobTtlEpochSeconds(),
        },
      }),
    );
  }

  async findById(tenantId: string, auditId: string): Promise<AuditJob | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: tableName(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.auditSk(auditId),
        },
      }),
    );
    if (!result.Item) return null;
    return toAudit(result.Item as Record<string, unknown>);
  }

  async listByTenant(tenantId: string, limit = 20): Promise<AuditJob[]> {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await this.doc.send(
        new QueryCommand({
          TableName: tableName(),
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': DynamoKeys.tenantPk(tenantId),
            ':skPrefix': DynamoKeys.auditSkPrefix(),
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const item of result.Items ?? []) {
        items.push(item as Record<string, unknown>);
      }
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    return items
      .map((item) => toAudit(item))
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .slice(0, limit);
  }
}

function toAudit(item: Record<string, unknown>): AuditJob {
  return AuditJob.reconstitute({
    tenantId: String(item['tenantId']),
    auditId: String(item['auditId']),
    accountId: String(item['accountId']),
    correlationId: String(item['correlationId']),
    status: item['status'] as AuditStatus,
    executionArn: (item['executionArn'] as string | null) ?? null,
    createdAtIso: String(item['createdAtIso']),
    completedAtIso: (item['completedAtIso'] as string | null) ?? null,
    findingCount: Number(item['findingCount'] ?? 0),
    criticalCount: Number(item['criticalCount'] ?? 0),
    highCount: Number(item['highCount'] ?? 0),
    estimatedMonthlySavingsUsd: Number(item['estimatedMonthlySavingsUsd'] ?? 0),
    globalScore: Number(item['globalScore'] ?? 0),
    pillarScores: (item['pillarScores'] as WafPillarScores) ?? {
      operationalExcellence: 0,
      security: 0,
      reliability: 0,
      performanceEfficiency: 0,
      costOptimization: 0,
      sustainability: 0,
    },
    errorMessage: (item['errorMessage'] as string | null) ?? null,
  });
}

export class DynamoDbAuditFindingRepository
  implements IAuditFindingWriter, IAuditFindingReader
{
  private readonly doc = getDocumentClient();

  async saveMany(findings: AuditFinding[]): Promise<void> {
    if (!findings.length) return;

    // BatchWrite rechaza PK+SK duplicados en el mismo request.
    const bySk = new Map<string, AuditFinding>();
    for (const f of findings) {
      bySk.set(DynamoKeys.findingSk(f.domain, f.findingId), f);
    }
    const unique = [...bySk.values()];

    for (let i = 0; i < unique.length; i += 25) {
      const chunk = unique.slice(i, i + 25);
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName()]: chunk.map((f) => ({
              PutRequest: {
                Item: {
                  PK: DynamoKeys.auditFindingsPk(f.tenantId, f.auditId),
                  SK: DynamoKeys.findingSk(f.domain, f.findingId),
                  entityType: EntityType.AuditFinding,
                  tenantId: f.tenantId,
                  auditId: f.auditId,
                  findingId: f.findingId,
                  domain: f.domain,
                  category: f.category,
                  severity: f.severity,
                  resourceArn: f.resourceArn,
                  resourceId: f.resourceId,
                  region: f.region,
                  title: f.title,
                  rationale: f.rationale,
                  recommendedAction: f.recommendedAction,
                  estimatedMonthlySavingsUsd: f.estimatedMonthlySavingsUsd,
                  checkId: f.checkId,
                  createdAtIso: f.createdAtIso,
                  ttl: auditDetailTtlEpochSeconds(),
                  GSI1PK: DynamoKeys.categoryGsi1Pk(
                    f.tenantId,
                    f.domain === 'finops'
                      ? 'finops'
                      : f.domain === 'secops'
                        ? 'secops'
                        : 'architecture',
                  ),
                  GSI1SK: DynamoKeys.categoryGsi1Sk(f.createdAtIso, f.findingId),
                },
              },
            })),
          },
        }),
      );
    }
  }

  async deleteByAudit(tenantId: string, auditId: string): Promise<number> {
    return deletePartitionItems(
      this.doc,
      tableName(),
      DynamoKeys.auditFindingsPk(tenantId, auditId),
      DynamoKeys.findingSkPrefix(),
    );
  }

  async listByAudit(
    tenantId: string,
    auditId: string,
  ): Promise<AuditFinding[]> {
    const table = tableName();
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await this.doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': DynamoKeys.auditFindingsPk(tenantId, auditId),
            ':skPrefix': DynamoKeys.findingSkPrefix(),
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const item of result.Items ?? []) {
        items.push(item as Record<string, unknown>);
      }
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    const mapped = items.map((item) =>
      AuditFinding.reconstitute({
        tenantId: String(item['tenantId'] ?? item['TenantId'] ?? ''),
        auditId: String(item['auditId']),
        findingId: String(item['findingId']),
        domain: item['domain'] as FindingDomain,
        category: String(item['category']),
        severity: item['severity'] as AuditSeverity,
        resourceArn: String(item['resourceArn'] ?? item['resourceId'] ?? ''),
        resourceId: String(item['resourceId']),
        region: String(item['region']),
        title: String(item['title']),
        rationale: String(item['rationale']),
        recommendedAction: String(item['recommendedAction']),
        estimatedMonthlySavingsUsd: Number(
          item['estimatedMonthlySavingsUsd'] ?? 0,
        ),
        checkId: (item['checkId'] as string | null) ?? null,
        friendlyHeadline: (item['friendlyHeadline'] as string | null) ?? null,
        friendlyWhy: (item['friendlyWhy'] as string | null) ?? null,
        friendlyAction: (item['friendlyAction'] as string | null) ?? null,
        friendlyArea: (item['friendlyArea'] as string | null) ?? null,
        friendlyHeadlineEs:
          (item['friendlyHeadlineEs'] as string | null) ??
          (item['friendlyHeadline'] as string | null) ??
          null,
        friendlyWhyEs:
          (item['friendlyWhyEs'] as string | null) ??
          (item['friendlyWhy'] as string | null) ??
          null,
        friendlyActionEs:
          (item['friendlyActionEs'] as string | null) ??
          (item['friendlyAction'] as string | null) ??
          null,
        friendlyAreaEs:
          (item['friendlyAreaEs'] as string | null) ??
          (item['friendlyArea'] as string | null) ??
          null,
        friendlyHeadlineEn: (item['friendlyHeadlineEn'] as string | null) ?? null,
        friendlyWhyEn: (item['friendlyWhyEn'] as string | null) ?? null,
        friendlyActionEn: (item['friendlyActionEn'] as string | null) ?? null,
        friendlyAreaEn: (item['friendlyAreaEn'] as string | null) ?? null,
        createdAtIso: String(item['createdAtIso']),
      }),
    );

    /**
     * Prefer findings operativos (Aggregate TS).
     * Si no hay finops operativos (CloudQuery vacío), exponer FINDING#etl#finops
     * del Business ETL para que Costos no quede en blanco.
     */
    const isEtl = (item: Record<string, unknown>): boolean => {
      const sk = String(item['SK'] ?? '');
      const entity = String(item['entityType'] ?? '');
      return sk.startsWith('FINDING#etl#') || entity === 'AUDIT_FINDING_ETL';
    };

    const opsItems = items
      .map((item, idx) => ({ item, finding: mapped[idx]! }))
      .filter(({ item }) => !isEtl(item))
      .map(({ finding }) => finding);

    const hasOpsFinops = opsItems.some((f) => f.domain === 'finops');
    if (hasOpsFinops) {
      return opsItems;
    }

    const etlFinops = items
      .map((item, idx) => ({ item, finding: mapped[idx]! }))
      .filter(({ item, finding }) => isEtl(item) && finding.domain === 'finops')
      .map(({ finding }) => finding);

    return [...opsItems, ...etlFinops];
  }
}

async function deletePartitionItems(
  doc: ReturnType<typeof getDocumentClient>,
  table: string,
  pk: string,
  skPrefix: string,
): Promise<number> {
  let deleted = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':sk': skPrefix,
        },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const keys = (page.Items ?? []) as Array<{ PK: string; SK: string }>;
    for (let i = 0; i < keys.length; i += 25) {
      const chunk = keys.slice(i, i + 25);
      await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [table]: chunk.map((k) => ({
              DeleteRequest: { Key: { PK: k.PK, SK: k.SK } },
            })),
          },
        }),
      );
      deleted += chunk.length;
    }

    exclusiveStartKey = page.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return deleted;
}
