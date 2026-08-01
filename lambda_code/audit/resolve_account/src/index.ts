import type { Handler } from 'aws-lambda';
import { AwsAccountLinkNotFoundError } from '@track-aws/domain';
import { DynamoDbAwsAccountLinkRepository } from '@track-aws/infrastructure';

type Input = {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
  regions?: string[];
};

export const handler: Handler<Input> = async (event) => {
  const links = new DynamoDbAwsAccountLinkRepository();
  const link = await links.findByAccount(event.tenantId, event.accountId);
  if (!link || !link.isScannable()) {
    throw new AwsAccountLinkNotFoundError(event.tenantId, event.accountId);
  }

  const fromEvent = (event.regions ?? []).map((r) => r.trim()).filter(Boolean);
  const regions =
    fromEvent.length > 0
      ? fromEvent
      : link.regions.length
        ? [...link.regions]
        : ['us-east-1', 'eu-west-1'];

  return {
    tenantId: event.tenantId,
    auditId: event.auditId,
    accountId: event.accountId,
    correlationId: event.correlationId,
    roleArn: link.roleArn,
    externalId: link.externalId,
    regions,
    regionsCsv: regions.join(','),
  };
};
