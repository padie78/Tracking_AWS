import {
  AwsAccountLinkNotFoundError,
  AwsAssumeRoleError,
} from '@track-aws/domain';
import type { ILogger } from '../../ports/shared/logger.port';
import type {
  IAwsAccountLinkReader,
  IAwsAccountLinkWriter,
} from '../../ports/accounts/aws-account-link.port';
import type { IAwsInventoryPort } from '../../ports/mcp/mcp-aws-inventory.port';
import {
  VerifyAwsAccountLinkInputSchema,
  type VerifyAwsAccountLinkInputDto,
} from '../../dto/accounts/link-aws-account.dto';

export interface VerifyAwsAccountLinkDeps {
  accountLinks: IAwsAccountLinkWriter & IAwsAccountLinkReader;
  inventory: IAwsInventoryPort;
  logger?: ILogger;
}

/**
 * Valida AssumeRole (inventario mínimo) y marca el vínculo como active.
 */
export class VerifyAwsAccountLinkUseCase {
  constructor(private readonly deps: VerifyAwsAccountLinkDeps) {}

  async execute(raw: unknown): Promise<{
    accountId: string;
    status: string;
    verifiedAtIso: string;
  }> {
    const input: VerifyAwsAccountLinkInputDto =
      VerifyAwsAccountLinkInputSchema.parse(raw);

    const link = await this.deps.accountLinks.findByAccount(
      input.tenantId,
      input.accountId,
    );
    if (!link) {
      throw new AwsAccountLinkNotFoundError(input.tenantId, input.accountId);
    }

    try {
      await this.deps.inventory.fetchInventory({
        tenantId: link.tenantId,
        accountId: link.accountId,
        roleArn: link.roleArn,
        externalId: link.externalId,
        regions: link.regions.length ? link.regions : ['us-east-1'],
      });
    } catch (err) {
      const failed = link.markError();
      await this.deps.accountLinks.save(failed);
      const detail = err instanceof Error ? err.message : String(err);
      throw new AwsAssumeRoleError(detail);
    }

    const active = link.markActive();
    await this.deps.accountLinks.save(active);

    this.deps.logger?.info('Cuenta AWS verificada', {
      tenantId: input.tenantId,
      accountId: input.accountId,
    });

    return {
      accountId: active.accountId,
      status: active.status,
      verifiedAtIso: active.verifiedAtIso ?? new Date().toISOString(),
    };
  }
}
