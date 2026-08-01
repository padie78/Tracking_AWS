import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PostConfirmationTriggerHandler } from 'aws-lambda';

const TABLE_NAME = process.env['CORE_TABLE_NAME'] ?? process.env['TABLE_NAME'] ?? '';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Bootstrap multi-tenant tras signup Cognito.
 * Espera `custom:tenant_id` y `custom:user_role` en el User Pool schema.
 * Idempotente: no sobrescribe membership existente.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  if (!TABLE_NAME) {
    throw new Error('CORE_TABLE_NAME no configurado.');
  }

  const attrs = event.request.userAttributes;
  const userId = attrs['sub'];
  if (!userId) {
    console.warn('PostConfirmation sin sub; se omite bootstrap.');
    return event;
  }

  const tenantId = attrs['custom:tenant_id']?.trim();
  if (!tenantId) {
    console.warn('PostConfirmation sin custom:tenant_id; se omite bootstrap.', {
      userId,
    });
    return event;
  }

  const role = attrs['custom:user_role']?.trim() || 'viewer';
  const email = attrs['email'] ?? '';
  const now = new Date().toISOString();
  const pk = `TENANT#${tenantId}`;
  const sk = `MEMBER#${userId}`;

  const existing = await doc.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    }),
  );

  if (existing.Item) {
    console.info('Membership ya existe; idempotente.', { tenantId, userId });
    return event;
  }

  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk,
        SK: sk,
        entityType: 'TENANT_MEMBER',
        tenantId,
        userId,
        email,
        role,
        createdAtIso: now,
        updatedAtIso: now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );

  console.info('Membership bootstrap creado', { tenantId, userId, role });
  return event;
};
