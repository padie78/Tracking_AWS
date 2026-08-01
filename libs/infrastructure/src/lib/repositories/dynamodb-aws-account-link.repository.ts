import { PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  AwsAccountLink,
  type AwsAccountLinkStatus,
} from '@track-aws/domain';
import type {
  IAwsAccountLinkReader,
  IAwsAccountLinkWriter,
} from '@track-aws/application';
import { DynamoKeys, EntityType } from '@track-aws/common';
import { getDocumentClient } from '../aws/dynamodb-client.factory';

function tableName(): string {
  const name = process.env['CORE_TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

function toEntity(item: Record<string, unknown>): AwsAccountLink {
  return AwsAccountLink.reconstitute({
    tenantId: String(item['tenantId']),
    accountId: String(item['accountId']),
    displayName: String(item['displayName'] ?? item['accountId']),
    roleArn: String(item['roleArn']),
    externalId: String(item['externalId']),
    regions: Array.isArray(item['regions'])
      ? (item['regions'] as unknown[]).map(String)
      : [],
    status: item['status'] as AwsAccountLinkStatus,
    linkedAtIso: String(item['linkedAtIso']),
    verifiedAtIso: (item['verifiedAtIso'] as string | null) ?? null,
  });
}

export class DynamoDbAwsAccountLinkRepository
  implements IAwsAccountLinkWriter, IAwsAccountLinkReader
{
  private readonly doc = getDocumentClient();

  async save(link: AwsAccountLink): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          PK: DynamoKeys.tenantPk(link.tenantId),
          SK: DynamoKeys.accountSk(link.accountId),
          entityType: EntityType.AwsAccountLink,
          tenantId: link.tenantId,
          accountId: link.accountId,
          displayName: link.displayName,
          roleArn: link.roleArn,
          externalId: link.externalId,
          regions: [...link.regions],
          status: link.status,
          linkedAtIso: link.linkedAtIso,
          verifiedAtIso: link.verifiedAtIso,
        },
      }),
    );
  }

  async findByAccount(
    tenantId: string,
    accountId: string,
  ): Promise<AwsAccountLink | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: tableName(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.accountSk(accountId),
        },
      }),
    );
    if (!result.Item) return null;
    return toEntity(result.Item as Record<string, unknown>);
  }

  async listByTenant(tenantId: string): Promise<AwsAccountLink[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.tenantPk(tenantId),
          ':skPrefix': DynamoKeys.accountSkPrefix(),
        },
      }),
    );
    return (result.Items ?? []).map((item) =>
      toEntity(item as Record<string, unknown>),
    );
  }
}
