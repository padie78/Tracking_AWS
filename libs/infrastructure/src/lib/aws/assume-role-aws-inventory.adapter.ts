import {
  STSClient,
  AssumeRoleCommand,
  type Credentials,
} from '@aws-sdk/client-sts';
import {
  EC2Client,
  DescribeVolumesCommand,
  DescribeAddressesCommand,
  paginateDescribeInstances,
} from '@aws-sdk/client-ec2';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import { AwsAssumeRoleError } from '@track-aws/domain';
import type {
  AwsInventorySnapshot,
  IAwsInventoryPort,
  InventoryEc2InstanceSnapshot,
  InventoryEbsVolumeSnapshot,
  InventoryElasticIpSnapshot,
} from '@track-aws/application';

const DEFAULT_REGIONS = ['us-east-1', 'eu-west-1'] as const;

/** Precios aproximados USD/mes (on-demand us-east-1) — suficiente para estimar savings MVP. */
const EC2_MONTHLY_USD: Record<string, number> = {
  't2.micro': 8.5,
  't2.small': 17,
  't2.medium': 34,
  't3.micro': 7.5,
  't3.small': 15,
  't3.medium': 30,
  't3.large': 60,
  't3.xlarge': 120,
  'm5.large': 70,
  'm5.xlarge': 140,
  'm5.2xlarge': 280,
  'c5.large': 62,
  'c5.xlarge': 124,
  'r5.large': 91,
  'r5.xlarge': 182,
};

const EBS_GP3_PER_GB = 0.08;
const EIP_IDLE_MONTHLY = 3.65;

function sessionName(tenantId: string, accountId: string): string {
  const raw = `trackaws-${tenantId.slice(0, 8)}-${accountId}`;
  return raw.replace(/[^a-zA-Z0-9+=,.@-]/g, '-').slice(0, 64);
}

function estimateEc2Monthly(instanceType: string): number {
  return EC2_MONTHLY_USD[instanceType] ?? 50;
}

function fromStsCredentials(creds: Credentials): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
} {
  if (!creds.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
    throw new AwsAssumeRoleError('STS no devolvió credenciales temporales');
  }
  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
  };
}

/**
 * Inventario cross-account vía sts:AssumeRole + EC2/CloudWatch read-only.
 * Datos solo en memoria del invocation — no se persisten crudos.
 */
export class AssumeRoleAwsInventoryAdapter implements IAwsInventoryPort {
  private readonly sts = new STSClient({});

  async fetchInventory(input: {
    tenantId: string;
    accountId: string;
    roleArn: string;
    externalId: string;
    regions?: readonly string[];
  }): Promise<AwsInventorySnapshot> {
    let credentials;
    try {
      const assumed = await this.sts.send(
        new AssumeRoleCommand({
          RoleArn: input.roleArn,
          RoleSessionName: sessionName(input.tenantId, input.accountId),
          ExternalId: input.externalId,
          DurationSeconds: 900,
        }),
      );
      credentials = fromStsCredentials(assumed.Credentials!);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new AwsAssumeRoleError(detail);
    }

    const regions =
      input.regions && input.regions.length > 0
        ? [...input.regions]
        : [...DEFAULT_REGIONS];

    const ec2Instances: InventoryEc2InstanceSnapshot[] = [];
    const ebsVolumes: InventoryEbsVolumeSnapshot[] = [];
    const elasticIps: InventoryElasticIpSnapshot[] = [];

    for (const region of regions) {
      const [instances, volumes, eips] = await Promise.all([
        this.listEc2(region, credentials, input.accountId),
        this.listEbs(region, credentials, input.accountId),
        this.listEips(region, credentials),
      ]);
      ec2Instances.push(...instances);
      ebsVolumes.push(...volumes);
      elasticIps.push(...eips);
    }

    return {
      accountId: input.accountId,
      capturedAtIso: new Date().toISOString(),
      ec2Instances,
      ebsVolumes,
      elasticIps,
    };
  }

  private async listEc2(
    region: string,
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    },
    accountId: string,
  ): Promise<InventoryEc2InstanceSnapshot[]> {
    const ec2 = new EC2Client({ region, credentials });
    const cw = new CloudWatchClient({ region, credentials });
    const out: InventoryEc2InstanceSnapshot[] = [];

    const paginator = paginateDescribeInstances({ client: ec2 }, {});
    for await (const page of paginator) {
      for (const reservation of page.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          const instanceId = instance.InstanceId;
          const instanceType = instance.InstanceType;
          if (!instanceId || !instanceType) continue;
          if (instance.State?.Name === 'terminated') continue;

          const avgCpu = await this.avgCpuPercent(cw, instanceId);
          out.push({
            instanceId,
            instanceArn: `arn:aws:ec2:${region}:${accountId}:instance/${instanceId}`,
            instanceType,
            region,
            state: instance.State?.Name ?? 'unknown',
            utilization: {
              avgCpuPercent: avgCpu,
              avgMemoryPercent: null,
              sampleWindowDays: 14,
            },
            estimatedMonthlyCostUsd: estimateEc2Monthly(instanceType),
          });
        }
      }
    }

    return out;
  }

  private async avgCpuPercent(
    cw: CloudWatchClient,
    instanceId: string,
  ): Promise<number> {
    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    try {
      const result = await cw.send(
        new GetMetricStatisticsCommand({
          Namespace: 'AWS/EC2',
          MetricName: 'CPUUtilization',
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
          StartTime: start,
          EndTime: end,
          Period: 86400,
          Statistics: ['Average'],
        }),
      );
      const points = result.Datapoints ?? [];
      if (!points.length) return 0;
      const sum = points.reduce((acc, p) => acc + (p.Average ?? 0), 0);
      return Math.round((sum / points.length) * 100) / 100;
    } catch {
      return 0;
    }
  }

  private async listEbs(
    region: string,
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    },
    accountId: string,
  ): Promise<InventoryEbsVolumeSnapshot[]> {
    const ec2 = new EC2Client({ region, credentials });
    const result = await ec2.send(new DescribeVolumesCommand({}));
    return (result.Volumes ?? []).map((vol) => {
      const volumeId = vol.VolumeId ?? 'unknown';
      const sizeGb = vol.Size ?? 0;
      const attached = (vol.Attachments ?? []).length > 0;
      return {
        volumeId,
        volumeArn: `arn:aws:ec2:${region}:${accountId}:volume/${volumeId}`,
        region,
        sizeGb,
        attached,
        estimatedMonthlyCostUsd:
          Math.round(sizeGb * EBS_GP3_PER_GB * 100) / 100,
      };
    });
  }

  private async listEips(
    region: string,
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    },
  ): Promise<InventoryElasticIpSnapshot[]> {
    const ec2 = new EC2Client({ region, credentials });
    const result = await ec2.send(new DescribeAddressesCommand({}));
    return (result.Addresses ?? []).map((addr) => {
      const associated = Boolean(addr.AssociationId || addr.InstanceId);
      return {
        allocationId: addr.AllocationId ?? addr.PublicIp ?? 'unknown',
        publicIp: addr.PublicIp ?? '',
        region,
        associated,
        estimatedMonthlyCostUsd: associated ? 0 : EIP_IDLE_MONTHLY,
      };
    });
  }
}

/** @deprecated Preferí AssumeRoleAwsInventoryAdapter. */
export { AssumeRoleAwsInventoryAdapter as McpAwsInventoryAdapter };
