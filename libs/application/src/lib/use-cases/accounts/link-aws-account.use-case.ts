import {
  AwsAccountLink,
} from '@track-aws/domain';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type {
  IAwsAccountLinkReader,
  IAwsAccountLinkWriter,
} from '../../ports/accounts/aws-account-link.port';
import {
  LinkAwsAccountInputSchema,
  type LinkAwsAccountInputDto,
} from '../../dto/accounts/link-aws-account.dto';

export interface LinkAwsAccountResult {
  accountId: string;
  displayName: string;
  roleArn: string;
  externalId: string;
  roleName: string;
  regions: string[];
  status: string;
  /** URL quick-create CloudFormation (región us-east-1 por defecto). */
  cloudFormationUrl: string;
  scannerAccountId: string;
  scannerRoleArn: string;
}

export interface LinkAwsAccountDeps {
  accountLinks: IAwsAccountLinkWriter & IAwsAccountLinkReader;
  idGenerator: IIdGenerator;
  /** Account ID de Track_AWS (cuenta que asume el rol del cliente). */
  scannerAccountId: string;
  /** ARN del rol Lambda / scanner que el cliente debe confiar. */
  scannerRoleArn: string;
  /** Template URL pública S3 o relativa servida por hosting. */
  connectTemplateUrl: string;
  logger?: ILogger;
}

function buildQuickCreateUrl(input: {
  templateUrl: string;
  stackName: string;
  externalId: string;
  scannerAccountId: string;
  scannerRoleArn: string;
  roleName: string;
}): string {
  const encode = (value: string): string => encodeURIComponent(value);
  const query = [
    `templateURL=${encode(input.templateUrl)}`,
    `stackName=${encode(input.stackName)}`,
    `param_ExternalId=${encode(input.externalId)}`,
    `param_TrackAwsAccountId=${encode(input.scannerAccountId)}`,
    `param_TrackAwsScannerRoleArn=${encode(input.scannerRoleArn)}`,
    `param_RoleName=${encode(input.roleName)}`,
  ].join('&');
  return `https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?${query}`;
}

/**
 * Registra un vínculo pending y entrega External ID + URL CloudFormation
 * para que el cliente despliegue el rol de solo lectura.
 */
export class LinkAwsAccountUseCase {
  constructor(private readonly deps: LinkAwsAccountDeps) {}

  async execute(raw: unknown): Promise<LinkAwsAccountResult> {
    const input: LinkAwsAccountInputDto = LinkAwsAccountInputSchema.parse(raw);
    const roleName = input.roleName?.trim() || 'TrackAwsScannerRole';
    const roleArn = AwsAccountLink.buildRoleArn(input.accountId, roleName);
    const externalId = `trackaws-${input.tenantId.slice(0, 8)}-${this.deps.idGenerator.generate()}`;

    const existing = await this.deps.accountLinks.findByAccount(
      input.tenantId,
      input.accountId,
    );

    const link =
      existing ??
      AwsAccountLink.create({
        tenantId: input.tenantId,
        accountId: input.accountId,
        displayName: input.displayName ?? input.accountId,
        roleArn,
        externalId,
        regions: input.regions,
      });

    const next =
      existing === null
        ? link
        : AwsAccountLink.reconstitute({
            tenantId: existing.tenantId,
            accountId: existing.accountId,
            displayName: input.displayName?.trim() || existing.displayName,
            roleArn,
            externalId: existing.externalId,
            regions: input.regions ?? [...existing.regions],
            status: existing.status === 'active' ? 'active' : 'pending',
            linkedAtIso: existing.linkedAtIso,
            verifiedAtIso: existing.verifiedAtIso,
          });

    await this.deps.accountLinks.save(next);

    const cloudFormationUrl = buildQuickCreateUrl({
      templateUrl: this.deps.connectTemplateUrl,
      stackName: `TrackAws-Connect-${input.accountId}`,
      externalId: next.externalId,
      scannerAccountId: this.deps.scannerAccountId,
      scannerRoleArn: this.deps.scannerRoleArn,
      roleName,
    });

    this.deps.logger?.info('Cuenta AWS vinculada (pending/active)', {
      tenantId: input.tenantId,
      accountId: input.accountId,
      status: next.status,
    });

    return {
      accountId: next.accountId,
      displayName: next.displayName,
      roleArn: next.roleArn,
      externalId: next.externalId,
      roleName,
      regions: [...next.regions],
      status: next.status,
      cloudFormationUrl,
      scannerAccountId: this.deps.scannerAccountId,
      scannerRoleArn: this.deps.scannerRoleArn,
    };
  }
}
