import { z } from 'zod';
import type { IAwsAccountLinkReader } from '../../ports/accounts/aws-account-link.port';
import type { IAwsInventoryPort } from '../../ports/mcp/mcp-aws-inventory.port';
import type {
  AccountInventoryView,
  InventoryResourceView,
} from '../../ports/inventory/inventory.port';

const InputSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
  regions: z.array(z.string().min(1)).optional(),
});

function toResources(
  snapshot: Awaited<ReturnType<IAwsInventoryPort['fetchInventory']>>,
): InventoryResourceView[] {
  const resources: InventoryResourceView[] = [];

  for (const inst of snapshot.ec2Instances) {
    resources.push({
      resourceType: 'ec2',
      resourceId: inst.instanceId,
      resourceArn: inst.instanceArn,
      region: inst.region,
      state: inst.state,
      detail: `${inst.instanceType} · CPU ${inst.utilization.avgCpuPercent}% (14d)`,
      estimatedMonthlyCostUsd: inst.estimatedMonthlyCostUsd,
    });
  }
  for (const vol of snapshot.ebsVolumes) {
    resources.push({
      resourceType: 'ebs',
      resourceId: vol.volumeId,
      resourceArn: vol.volumeArn,
      region: vol.region,
      state: vol.attached ? 'attached' : 'unattached',
      detail: `${vol.sizeGb} GiB`,
      estimatedMonthlyCostUsd: vol.estimatedMonthlyCostUsd,
    });
  }
  for (const eip of snapshot.elasticIps) {
    resources.push({
      resourceType: 'eip',
      resourceId: eip.allocationId,
      resourceArn: `arn:aws:ec2:${eip.region}:${snapshot.accountId}:elastic-ip/${eip.allocationId}`,
      region: eip.region,
      state: eip.associated ? 'associated' : 'idle',
      detail: eip.publicIp,
      estimatedMonthlyCostUsd: eip.estimatedMonthlyCostUsd,
    });
  }
  return resources;
}

export class GetAccountInventoryUseCase {
  constructor(
    private readonly links: IAwsAccountLinkReader,
    private readonly inventory: IAwsInventoryPort,
  ) {}

  async execute(raw: unknown): Promise<AccountInventoryView> {
    const input = InputSchema.parse(raw);
    const link = await this.links.findByAccount(input.tenantId, input.accountId);
    if (!link || !link.isScannable()) {
      throw new Error(
        `Cuenta ${input.accountId} no está active/verificada para inventario.`,
      );
    }

    const regions =
      input.regions && input.regions.length > 0
        ? input.regions
        : [...link.regions];

    const snapshot = await this.inventory.fetchInventory({
      tenantId: input.tenantId,
      accountId: input.accountId,
      roleArn: link.roleArn,
      externalId: link.externalId,
      regions,
    });

    const resources = toResources(snapshot);
    return {
      accountId: snapshot.accountId,
      capturedAtIso: snapshot.capturedAtIso,
      source: 'live',
      auditId: null,
      summary: {
        ec2Count: snapshot.ec2Instances.length,
        ebsCount: snapshot.ebsVolumes.length,
        eipCount: snapshot.elasticIps.length,
        runningEc2Count: snapshot.ec2Instances.filter((i) => i.state === 'running')
          .length,
        stoppedEc2Count: snapshot.ec2Instances.filter((i) => i.state === 'stopped')
          .length,
        unattachedEbsCount: snapshot.ebsVolumes.filter((v) => !v.attached).length,
        idleEipCount: snapshot.elasticIps.filter((e) => !e.associated).length,
      },
      resources,
    };
  }
}
