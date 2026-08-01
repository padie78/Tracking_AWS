import {
  ListAwsAccountsInputSchema,
  type ListAwsAccountsInputDto,
} from '../../dto/accounts/link-aws-account.dto';
import type { IAwsAccountLinkReader } from '../../ports/accounts/aws-account-link.port';

export interface AwsAccountLinkView {
  accountId: string;
  displayName: string;
  roleArn: string;
  externalId: string;
  regions: string[];
  status: string;
  linkedAtIso: string;
  verifiedAtIso: string | null;
}

export class ListAwsAccountsUseCase {
  constructor(private readonly accountLinks: IAwsAccountLinkReader) {}

  async execute(raw: unknown): Promise<AwsAccountLinkView[]> {
    const input: ListAwsAccountsInputDto = ListAwsAccountsInputSchema.parse(raw);
    const links = await this.accountLinks.listByTenant(input.tenantId);
    return links.map((link) => ({
      accountId: link.accountId,
      displayName: link.displayName,
      roleArn: link.roleArn,
      externalId: link.externalId,
      regions: [...link.regions],
      status: link.status,
      linkedAtIso: link.linkedAtIso,
      verifiedAtIso: link.verifiedAtIso,
    }));
  }
}
