import {
  BatchWriteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoKeys, EntityType } from '@track-aws/common';
import type {
  IAuditInventoryReader,
  IAuditInventoryWriter,
  InventoryResourceView,
} from '@track-aws/application';
import { getDocumentClient } from '../aws/dynamodb-client.factory';
import { auditDetailTtlEpochSeconds } from '../retention/hot-retention';

function requireTable(): string {
  const name = process.env['CORE_TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

export class DynamoDbAuditInventoryRepository
  implements IAuditInventoryWriter, IAuditInventoryReader
{
  private readonly doc = getDocumentClient();

  async saveMany(input: {
    tenantId: string;
    auditId: string;
    accountId: string;
    resources: InventoryResourceView[];
  }): Promise<void> {
    if (input.resources.length === 0) return;
    const table = requireTable();
    const pk = DynamoKeys.auditFindingsPk(input.tenantId, input.auditId);
    const ttl = auditDetailTtlEpochSeconds();

    // BatchWrite rechaza keys duplicadas en el mismo request.
    const bySk = new Map<string, InventoryResourceView>();
    for (const r of input.resources) {
      bySk.set(DynamoKeys.resourceSk(r.resourceType, r.region, r.resourceId), r);
    }
    const unique = [...bySk.entries()];

    for (let i = 0; i < unique.length; i += 25) {
      const chunk = unique.slice(i, i + 25);
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [table]: chunk.map(([sk, r]) => ({
              PutRequest: {
                Item: {
                  PK: pk,
                  SK: sk,
                  entityType: EntityType.InventoryResource,
                  tenantId: input.tenantId,
                  auditId: input.auditId,
                  accountId: input.accountId,
                  resourceType: r.resourceType,
                  resourceId: r.resourceId,
                  resourceArn: r.resourceArn,
                  region: r.region,
                  state: r.state,
                  detail: r.detail,
                  estimatedMonthlyCostUsd: r.estimatedMonthlyCostUsd,
                  ttl,
                },
              },
            })),
          },
        }),
      );
    }
  }

  async deleteByAudit(tenantId: string, auditId: string): Promise<number> {
    const table = requireTable();
    const pk = DynamoKeys.auditFindingsPk(tenantId, auditId);
    let deleted = 0;
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': pk,
            ':sk': DynamoKeys.resourceSkPrefix(),
          },
          ProjectionExpression: 'PK, SK',
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      const keys = (page.Items ?? []) as Array<{ PK: string; SK: string }>;
      for (let i = 0; i < keys.length; i += 25) {
        const chunk = keys.slice(i, i + 25);
        await this.doc.send(
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

  async listByAudit(
    tenantId: string,
    auditId: string,
  ): Promise<InventoryResourceView[]> {
    const table = requireTable();
    const result = await this.doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.auditFindingsPk(tenantId, auditId),
          ':sk': DynamoKeys.resourceSkPrefix(),
        },
      }),
    );

    return (result.Items ?? []).map((item) => ({
      resourceType: String(item['resourceType']),
      resourceId: String(item['resourceId']),
      resourceArn: String(item['resourceArn'] ?? ''),
      region: String(item['region'] ?? ''),
      state: String(item['state'] ?? ''),
      detail: String(item['detail'] ?? ''),
      estimatedMonthlyCostUsd: Number(item['estimatedMonthlyCostUsd'] ?? 0),
    }));
  }
}
