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

    const chunks: InventoryResourceView[][] = [];
    for (let i = 0; i < input.resources.length; i += 25) {
      chunks.push(input.resources.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [table]: chunk.map((r) => ({
              PutRequest: {
                Item: {
                  PK: pk,
                  SK: DynamoKeys.resourceSk(r.resourceType, r.resourceId),
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
                },
              },
            })),
          },
        }),
      );
    }
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
