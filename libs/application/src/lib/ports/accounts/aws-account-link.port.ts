import type { AwsAccountLink } from '@track-aws/domain';

export interface IAwsAccountLinkWriter {
  save(link: AwsAccountLink): Promise<void>;
}

export interface IAwsAccountLinkReader {
  findByAccount(
    tenantId: string,
    accountId: string,
  ): Promise<AwsAccountLink | null>;
  listByTenant(tenantId: string): Promise<AwsAccountLink[]>;
}
