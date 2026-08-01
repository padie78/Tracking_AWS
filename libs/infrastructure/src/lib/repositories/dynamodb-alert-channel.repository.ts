import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  AlertChannel,
  type AlertCategoryFilter,
  type AlertChannelKind,
  type IAlertChannelRepository,
} from '@track-aws/domain';
import { DynamoKeys } from '@track-aws/common';
import { getDocumentClient } from '../aws/dynamodb-client.factory';

function requireTable(): string {
  const name = process.env['CORE_TABLE_NAME'] ?? process.env['TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

type Item = {
  PK: string;
  SK: string;
  entityType: string;
  tenantId: string;
  channelId: string;
  kind: AlertChannelKind;
  target: string;
  label: string;
  categories: AlertCategoryFilter[];
  enabled: boolean;
  createdAtIso: string;
};

function toEntity(item: Item): AlertChannel {
  return AlertChannel.reconstitute({
    tenantId: item.tenantId,
    channelId: item.channelId,
    kind: item.kind,
    target: item.target,
    label: item.label,
    categories: item.categories,
    enabled: item.enabled,
    createdAtIso: item.createdAtIso,
  });
}

export class DynamoDbAlertChannelRepository implements IAlertChannelRepository {
  private readonly db = getDocumentClient();

  async save(channel: AlertChannel): Promise<void> {
    const props = channel.toProps();
    await this.db.send(
      new PutCommand({
        TableName: requireTable(),
        Item: {
          PK: DynamoKeys.tenantPk(props.tenantId),
          SK: DynamoKeys.alertSk(props.channelId),
          entityType: 'ALERT_CHANNEL',
          ...props,
        } satisfies Item,
      }),
    );
  }

  async delete(tenantId: string, channelId: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: requireTable(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.alertSk(channelId),
        },
      }),
    );
  }

  async listByTenant(tenantId: string): Promise<AlertChannel[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: requireTable(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.tenantPk(tenantId),
          ':sk': DynamoKeys.alertSkPrefix(),
        },
      }),
    );
    return (result.Items ?? []).map((item) => toEntity(item as Item));
  }
}
