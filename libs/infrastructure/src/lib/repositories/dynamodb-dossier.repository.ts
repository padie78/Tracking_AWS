import { PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SavingsDossier } from '@track-aws/domain';
import type { IDossierReader, IDossierWriter } from '@track-aws/application';
import { DynamoKeys, EntityType } from '@track-aws/common';
import { getDocumentClient } from '../aws/dynamodb-client.factory';

function tableName(): string {
  const name = process.env['CORE_TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

export class DynamoDbDossierRepository
  implements IDossierWriter, IDossierReader
{
  private readonly doc = getDocumentClient();

  async save(dossier: SavingsDossier): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          PK: DynamoKeys.tenantPk(dossier.tenantId),
          SK: DynamoKeys.dossierSk(dossier.dossierId),
          entityType: EntityType.SavingsDossier,
          tenantId: dossier.tenantId,
          dossierId: dossier.dossierId,
          scanId: dossier.scanId,
          accountId: dossier.accountId,
          title: dossier.title,
          markdownBody: dossier.markdownBody,
          totalEstimatedMonthlySavingsUsd:
            dossier.totalEstimatedMonthlySavings.amount,
          findingIds: [...dossier.findingIds],
          remediationSteps: dossier.remediationSteps.map((s) => s.toJSON()),
          createdAtIso: dossier.createdAtIso,
        },
      }),
    );
  }

  async findById(
    tenantId: string,
    dossierId: string,
  ): Promise<SavingsDossier | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: tableName(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.dossierSk(dossierId),
        },
      }),
    );
    if (!result.Item) return null;
    return this.toDossier(result.Item);
  }

  async findLatestByScan(
    tenantId: string,
    scanId: string,
  ): Promise<SavingsDossier | null> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.tenantPk(tenantId),
          ':skPrefix': 'DOSSIER#',
          ':scanId': scanId,
        },
        FilterExpression: 'scanId = :scanId',
        ScanIndexForward: false,
        Limit: 10,
      }),
    );
    const item = result.Items?.[0];
    if (!item) return null;
    return this.toDossier(item);
  }

  private toDossier(item: Record<string, unknown>): SavingsDossier {
    return SavingsDossier.create({
      tenantId: String(item['tenantId']),
      dossierId: String(item['dossierId']),
      scanId: String(item['scanId']),
      accountId: String(item['accountId']),
      title: String(item['title']),
      markdownBody: String(item['markdownBody']),
      totalEstimatedMonthlySavingsUsd: Number(
        item['totalEstimatedMonthlySavingsUsd'] ?? 0,
      ),
      findingIds: (item['findingIds'] as string[]) ?? [],
      remediationSteps:
        (item['remediationSteps'] as {
          order: number;
          title: string;
          instruction: string;
          estimatedMinutes: number | null;
        }[]) ?? [],
      createdAtIso: String(item['createdAtIso']),
    });
  }
}
