import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoKeys, EntityType } from '@track-aws/common';
import type { TopologySnapshot } from '@track-aws/domain';
import { getDocumentClient } from '../aws/dynamodb-client.factory';
import { auditDetailTtlEpochSeconds } from '../retention/hot-retention';

function tableName(): string {
  const name = process.env['CORE_TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

export class DynamoDbTopologySnapshotRepository {
  private readonly doc = getDocumentClient();

  async save(snapshot: TopologySnapshot): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          PK: DynamoKeys.tenantPk(snapshot.tenantId),
          SK: DynamoKeys.topologySk(snapshot.auditId),
          entityType: EntityType.TopologySnapshot,
          tenantId: snapshot.tenantId,
          accountId: snapshot.accountId,
          auditId: snapshot.auditId,
          asOfIso: snapshot.asOfIso,
          capturedAtIso: snapshot.capturedAtIso,
          source: snapshot.source,
          summary: snapshot.summary,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          ttl: auditDetailTtlEpochSeconds(),
        },
      }),
    );
  }

  async findByAudit(
    tenantId: string,
    auditId: string,
  ): Promise<TopologySnapshot | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: tableName(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.topologySk(auditId),
        },
      }),
    );
    const item = result.Item;
    if (!item) return null;
    return {
      tenantId: String(item['tenantId']),
      accountId: String(item['accountId']),
      auditId: String(item['auditId']),
      asOfIso: String(item['asOfIso']),
      capturedAtIso: String(item['capturedAtIso']),
      source: item['source'] as TopologySnapshot['source'],
      summary: item['summary'] as TopologySnapshot['summary'],
      nodes: (item['nodes'] as TopologySnapshot['nodes']) ?? [],
      edges: (item['edges'] as TopologySnapshot['edges']) ?? [],
    };
  }
}
