import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoKeys, EntityType } from '@track-aws/common';
import type {
  ITenantMemberReader,
  ITenantMemberWriter,
  ITenantProfileReader,
  ITenantProfileWriter,
  TenantMemberView,
  TenantProfileView,
} from '@track-aws/application';
import type { UserRoleValue } from '@track-aws/domain';
import { getDocumentClient } from '../aws/dynamodb-client.factory';

function tableName(): string {
  const name = process.env['CORE_TABLE_NAME'];
  if (!name) throw new Error('Missing env CORE_TABLE_NAME');
  return name;
}

function asRole(raw: unknown): UserRoleValue {
  const v = String(raw ?? 'viewer').toLowerCase();
  if (v === 'finops_admin' || v === 'analyst' || v === 'viewer') return v;
  return 'viewer';
}

export class DynamoDbTenantMembershipRepository
  implements
    ITenantMemberReader,
    ITenantMemberWriter,
    ITenantProfileReader,
    ITenantProfileWriter
{
  private readonly doc = getDocumentClient();

  async findByUser(
    tenantId: string,
    userId: string,
  ): Promise<TenantMemberView | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: tableName(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.memberSk(userId),
        },
      }),
    );
    if (!result.Item) return null;
    return {
      tenantId: String(result.Item['tenantId']),
      userId: String(result.Item['userId']),
      email: String(result.Item['email'] ?? ''),
      role: asRole(result.Item['role']),
      createdAtIso: String(result.Item['createdAtIso']),
      updatedAtIso: String(result.Item['updatedAtIso']),
    };
  }

  async save(member: TenantMemberView): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          PK: DynamoKeys.tenantPk(member.tenantId),
          SK: DynamoKeys.memberSk(member.userId),
          entityType: EntityType.TenantMember,
          tenantId: member.tenantId,
          userId: member.userId,
          email: member.email,
          role: member.role,
          createdAtIso: member.createdAtIso,
          updatedAtIso: member.updatedAtIso,
        },
      }),
    );
  }

  async findByTenant(tenantId: string): Promise<TenantProfileView | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: tableName(),
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.profileSk(),
        },
      }),
    );
    if (!result.Item) return null;
    return {
      tenantId: String(result.Item['tenantId']),
      name: String(result.Item['name'] ?? tenantId),
      plan: String(result.Item['plan'] ?? 'starter'),
      createdAtIso: String(result.Item['createdAtIso']),
      updatedAtIso: String(result.Item['updatedAtIso']),
    };
  }

  async saveIfAbsent(profile: TenantProfileView): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: tableName(),
          Item: {
            PK: DynamoKeys.tenantPk(profile.tenantId),
            SK: DynamoKeys.profileSk(),
            entityType: EntityType.TenantProfile,
            tenantId: profile.tenantId,
            name: profile.name,
            plan: profile.plan,
            createdAtIso: profile.createdAtIso,
            updatedAtIso: profile.updatedAtIso,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return true;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }
}
