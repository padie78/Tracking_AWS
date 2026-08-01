import { PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { Finding, ScanJob } from '@track-aws/domain';
import type {
  IFindingReader,
  IFindingWriter,
  IScanJobReader,
  IScanJobWriter,
} from '@track-aws/application';
import { DynamoKeys, EntityType } from '@track-aws/common';
import type { FindingCategoryValue } from '@track-aws/domain';
import { Finding as FindingEntity, ScanJob as ScanJobEntity } from '@track-aws/domain';
import { getDocumentClient } from '../aws/dynamodb-client.factory';

function tableName(): string {
  const name = process.env['CORE_TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

export class DynamoDbScanJobRepository
  implements IScanJobWriter, IScanJobReader
{
  private readonly doc = getDocumentClient();

  async save(scan: ScanJob): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          PK: DynamoKeys.tenantPk(scan.tenantId),
          SK: DynamoKeys.scanSk(scan.scanId),
          entityType: EntityType.ScanJob,
          tenantId: scan.tenantId,
          scanId: scan.scanId,
          accountId: scan.accountId,
          status: scan.status,
          correlationId: scan.correlationId,
          createdAtIso: scan.createdAtIso,
          completedAtIso: scan.completedAtIso,
          findingCount: scan.findingCount,
          estimatedMonthlySavingsUsd: scan.estimatedMonthlySavingsUsd,
        },
      }),
    );
  }

  async findById(tenantId: string, scanId: string): Promise<ScanJob | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: tableName(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.scanSk(scanId),
        },
      }),
    );
    if (!result.Item) return null;
    return ScanJobEntity.reconstitute({
      tenantId: String(result.Item['tenantId']),
      scanId: String(result.Item['scanId']),
      accountId: String(result.Item['accountId']),
      status: result.Item['status'] as ScanJob['status'],
      correlationId: String(result.Item['correlationId']),
      createdAtIso: String(result.Item['createdAtIso']),
      completedAtIso: (result.Item['completedAtIso'] as string | null) ?? null,
      findingCount: Number(result.Item['findingCount'] ?? 0),
      estimatedMonthlySavingsUsd: Number(
        result.Item['estimatedMonthlySavingsUsd'] ?? 0,
      ),
    });
  }

  async findLatestByAccount(
    tenantId: string,
    accountId: string,
  ): Promise<ScanJob | null> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.tenantPk(tenantId),
          ':skPrefix': DynamoKeys.scanSkPrefix(),
          ':accountId': accountId,
        },
        FilterExpression: 'accountId = :accountId',
        ScanIndexForward: false,
        Limit: 25,
      }),
    );
    const item = result.Items?.[0];
    if (!item) return null;
    return ScanJobEntity.reconstitute({
      tenantId: String(item['tenantId']),
      scanId: String(item['scanId']),
      accountId: String(item['accountId']),
      status: item['status'] as ScanJob['status'],
      correlationId: String(item['correlationId']),
      createdAtIso: String(item['createdAtIso']),
      completedAtIso: (item['completedAtIso'] as string | null) ?? null,
      findingCount: Number(item['findingCount'] ?? 0),
      estimatedMonthlySavingsUsd: Number(item['estimatedMonthlySavingsUsd'] ?? 0),
    });
  }
}

export class DynamoDbFindingRepository
  implements IFindingWriter, IFindingReader
{
  private readonly doc = getDocumentClient();

  async save(finding: Finding): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          PK: DynamoKeys.scanFindingsPk(finding.tenantId, finding.scanId),
          SK: DynamoKeys.findingSk(finding.category, finding.findingId),
          GSI1PK: DynamoKeys.categoryGsi1Pk(finding.tenantId, finding.category),
          GSI1SK: DynamoKeys.categoryGsi1Sk(
            finding.createdAtIso,
            finding.findingId,
          ),
          entityType: EntityType.Finding,
          tenantId: finding.tenantId,
          scanId: finding.scanId,
          findingId: finding.findingId,
          category: finding.category,
          resourceArn: finding.resourceArn,
          resourceId: finding.resourceId,
          region: finding.region,
          title: finding.title,
          rationale: finding.rationale,
          severity: finding.severity,
          estimatedMonthlySavingsUsd: finding.estimatedMonthlySavings.amount,
          recommendedAction: finding.recommendedAction,
          createdAtIso: finding.createdAtIso,
          ...(finding.ttlEpochSeconds !== null
            ? { ttl: finding.ttlEpochSeconds }
            : {}),
        },
      }),
    );
  }

  async listByScan(tenantId: string, scanId: string): Promise<Finding[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': DynamoKeys.scanFindingsPk(tenantId, scanId),
          ':skPrefix': DynamoKeys.findingSkPrefix(),
        },
      }),
    );
    return (result.Items ?? []).map((item) => this.toFinding(item));
  }

  async listByCategory(
    tenantId: string,
    category: FindingCategoryValue,
  ): Promise<Finding[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': DynamoKeys.categoryGsi1Pk(tenantId, category),
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items ?? []).map((item) => this.toFinding(item));
  }

  private toFinding(item: Record<string, unknown>): Finding {
    return FindingEntity.create({
      tenantId: String(item['tenantId']),
      scanId: String(item['scanId']),
      findingId: String(item['findingId']),
      category: String(item['category']),
      resourceArn: String(item['resourceArn']),
      resourceId: String(item['resourceId']),
      region: String(item['region']),
      title: String(item['title']),
      rationale: String(item['rationale']),
      severity: item['severity'] as Finding['severity'],
      estimatedMonthlySavingsUsd: Number(item['estimatedMonthlySavingsUsd'] ?? 0),
      recommendedAction: String(item['recommendedAction']),
      createdAtIso: String(item['createdAtIso']),
      ttlEpochSeconds: (item['ttl'] as number | undefined) ?? null,
    });
  }
}
