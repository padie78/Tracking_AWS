import type { AwsAccountLink } from '../entities/aws-account-link';

export interface IAwsAccountLinkRepository {
  save(link: AwsAccountLink): Promise<void>;
  findByAccount(
    tenantId: string,
    accountId: string,
  ): Promise<AwsAccountLink | null>;
  listByTenant(tenantId: string): Promise<AwsAccountLink[]>;
}
