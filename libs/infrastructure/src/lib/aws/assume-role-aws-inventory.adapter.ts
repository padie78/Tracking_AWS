import {
  STSClient,
  AssumeRoleCommand,
  type Credentials,
} from '@aws-sdk/client-sts';
import {
  EC2Client,
  DescribeVolumesCommand,
  DescribeAddressesCommand,
  DescribeNatGatewaysCommand,
  DescribeVpcsCommand,
  DescribeSecurityGroupsCommand,
  paginateDescribeInstances,
} from '@aws-sdk/client-ec2';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import {
  RDSClient,
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
} from '@aws-sdk/client-rds';
import {
  LambdaClient,
  ListFunctionsCommand,
} from '@aws-sdk/client-lambda';
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
} from '@aws-sdk/client-ecs';
import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { SQSClient, ListQueuesCommand } from '@aws-sdk/client-sqs';
import { SNSClient, ListTopicsCommand } from '@aws-sdk/client-sns';
import {
  IAMClient,
  ListUsersCommand,
  ListRolesCommand,
} from '@aws-sdk/client-iam';
import {
  CloudFrontClient,
  ListDistributionsCommand,
} from '@aws-sdk/client-cloudfront';
import {
  ResourceGroupsTaggingAPIClient,
  paginateGetResources,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { AwsAssumeRoleError } from '@track-aws/domain';
import type {
  AwsInventorySnapshot,
  IAwsInventoryPort,
  InventoryEc2InstanceSnapshot,
  InventoryEbsVolumeSnapshot,
  InventoryElasticIpSnapshot,
  InventoryListedResourceSnapshot,
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
const NAT_MONTHLY = 32;
const ALB_MONTHLY = 22;

type SessionCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

function sessionName(tenantId: string, accountId: string): string {
  const raw = `trackaws-${tenantId.slice(0, 8)}-${accountId}`;
  return raw.replace(/[^a-zA-Z0-9+=,.@-]/g, '-').slice(0, 64);
}

function estimateEc2Monthly(instanceType: string): number {
  return EC2_MONTHLY_USD[instanceType] ?? 50;
}

function fromStsCredentials(creds: Credentials): SessionCreds {
  if (!creds.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
    throw new AwsAssumeRoleError('STS no devolvió credenciales temporales');
  }
  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
  };
}

async function settled<T>(fn: () => Promise<T[]>, label: string): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[inventory] ${label} omitido`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function normalizeTaggedType(awsType: string): string {
  const t = awsType.toLowerCase();
  if (t.includes('ec2') && t.includes('instance')) return 'ec2';
  if (t.includes('volume')) return 'ebs';
  if (t.includes('elasticip') || t.includes('eip')) return 'eip';
  if (t.includes('s3')) return 's3';
  if (t.includes('rds') || t.includes('dbinstance') || t.includes('dbcluster'))
    return 'rds';
  if (t.includes('lambda')) return 'lambda';
  if (t.includes('loadbalancer') || t.includes('elbv2') || t.includes('elasticloadbalancing'))
    return 'elb';
  if (t.includes('dynamodb')) return 'dynamodb';
  if (t.includes('sqs')) return 'sqs';
  if (t.includes('sns')) return 'sns';
  if (t.includes('ecs')) return 'ecs';
  if (t.includes('eks')) return 'eks';
  if (t.includes('natgateway')) return 'nat';
  if (t.includes('security-group') || t.includes('securitygroup')) return 'sg';
  if (t.includes('vpc')) return 'vpc';
  if (t.includes('cloudfront')) return 'cloudfront';
  if (t.includes('iam') && t.includes('user')) return 'iam-user';
  if (t.includes('iam') && t.includes('role')) return 'iam-role';
  const short = awsType.split('::').pop() ?? awsType;
  return short.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().slice(0, 40) || 'other';
}

function idFromArn(arn: string): string {
  const tail = arn.split('/').pop() ?? arn;
  return tail.split(':').pop() ?? tail;
}

function regionFromArn(arn: string): string {
  const parts = arn.split(':');
  return parts[3] || 'global';
}

/**
 * Inventario cross-account vía sts:AssumeRole + APIs multi-servicio.
 * Soft-fail por servicio: un List vacío/fallido no aborta el resto.
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
    let credentials: SessionCreds;
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
    const listed: InventoryListedResourceSnapshot[] = [];

    for (const region of regions) {
      const [instances, volumes, eips, regional] = await Promise.all([
        this.listEc2(region, credentials, input.accountId),
        this.listEbs(region, credentials, input.accountId),
        this.listEips(region, credentials),
        this.listRegionalCatalog(region, credentials, input.accountId),
      ]);
      ec2Instances.push(...instances);
      ebsVolumes.push(...volumes);
      elasticIps.push(...eips);
      listed.push(...regional);
    }

    const global = await this.listGlobalCatalog(credentials, input.accountId);
    listed.push(...global);

    // Enriquecer catálogo con EC2/EBS/EIP (detalle FinOps) y dedupe por ARN.
    const enriched: InventoryListedResourceSnapshot[] = [
      ...ec2Instances.map((inst) => ({
        resourceType: 'ec2',
        resourceId: inst.instanceId,
        resourceArn: inst.instanceArn,
        region: inst.region,
        state: inst.state,
        detail: `${inst.instanceType} · CPU ${inst.utilization.avgCpuPercent}% (14d)`,
        estimatedMonthlyCostUsd: inst.estimatedMonthlyCostUsd,
      })),
      ...ebsVolumes.map((vol) => ({
        resourceType: 'ebs',
        resourceId: vol.volumeId,
        resourceArn: vol.volumeArn,
        region: vol.region,
        state: vol.attached ? 'attached' : 'unattached',
        detail: `${vol.sizeGb} GiB`,
        estimatedMonthlyCostUsd: vol.estimatedMonthlyCostUsd,
      })),
      ...elasticIps.map((eip) => ({
        resourceType: 'eip',
        resourceId: eip.allocationId,
        resourceArn: `arn:aws:ec2:${eip.region}:${input.accountId}:elastic-ip/${eip.allocationId}`,
        region: eip.region,
        state: eip.associated ? 'associated' : 'idle',
        detail: eip.publicIp,
        estimatedMonthlyCostUsd: eip.estimatedMonthlyCostUsd,
      })),
      ...listed,
    ];

    const byArn = new Map<string, InventoryListedResourceSnapshot>();
    for (const r of enriched) {
      const key = r.resourceArn || `${r.resourceType}:${r.region}:${r.resourceId}`;
      const prev = byArn.get(key);
      if (!prev || r.detail.length >= prev.detail.length) {
        byArn.set(key, r);
      }
    }

    return {
      accountId: input.accountId,
      capturedAtIso: new Date().toISOString(),
      ec2Instances,
      ebsVolumes,
      elasticIps,
      listedResources: [...byArn.values()].sort((a, b) =>
        a.resourceType === b.resourceType
          ? a.resourceId.localeCompare(b.resourceId)
          : a.resourceType.localeCompare(b.resourceType),
      ),
    };
  }

  private async listRegionalCatalog(
    region: string,
    credentials: SessionCreds,
    accountId: string,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const [nats, vpcs, sgs, rds, clusters, lambdas, elbs, ecs, ddb, sqs, sns, tagged] =
      await Promise.all([
        settled(() => this.listNat(region, credentials, accountId), `nat:${region}`),
        settled(() => this.listVpcs(region, credentials, accountId), `vpc:${region}`),
        settled(() => this.listSecurityGroups(region, credentials, accountId), `sg:${region}`),
        settled(() => this.listRds(region, credentials), `rds:${region}`),
        settled(() => this.listRdsClusters(region, credentials), `rds-cluster:${region}`),
        settled(() => this.listLambda(region, credentials), `lambda:${region}`),
        settled(() => this.listElb(region, credentials), `elb:${region}`),
        settled(() => this.listEcs(region, credentials), `ecs:${region}`),
        settled(() => this.listDynamo(region, credentials), `dynamodb:${region}`),
        settled(() => this.listSqs(region, credentials), `sqs:${region}`),
        settled(() => this.listSns(region, credentials), `sns:${region}`),
        settled(() => this.listTagged(region, credentials), `tagged:${region}`),
      ]);

    return [
      ...nats,
      ...vpcs,
      ...sgs,
      ...rds,
      ...clusters,
      ...lambdas,
      ...elbs,
      ...ecs,
      ...ddb,
      ...sqs,
      ...sns,
      ...tagged,
    ];
  }

  private async listGlobalCatalog(
    credentials: SessionCreds,
    accountId: string,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const [s3, users, roles, cf] = await Promise.all([
      settled(() => this.listS3(credentials), 's3'),
      settled(() => this.listIamUsers(credentials, accountId), 'iam-users'),
      settled(() => this.listIamRoles(credentials, accountId), 'iam-roles'),
      settled(() => this.listCloudFront(credentials), 'cloudfront'),
    ]);
    return [...s3, ...users, ...roles, ...cf];
  }

  private async listEc2(
    region: string,
    credentials: SessionCreds,
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
    credentials: SessionCreds,
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
    credentials: SessionCreds,
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

  private async listNat(
    region: string,
    credentials: SessionCreds,
    accountId: string,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const ec2 = new EC2Client({ region, credentials });
    const result = await ec2.send(new DescribeNatGatewaysCommand({}));
    return (result.NatGateways ?? [])
      .filter((n) => n.State !== 'deleted')
      .map((n) => ({
        resourceType: 'nat',
        resourceId: n.NatGatewayId ?? 'unknown',
        resourceArn: `arn:aws:ec2:${region}:${accountId}:natgateway/${n.NatGatewayId}`,
        region,
        state: n.State ?? 'unknown',
        detail: n.SubnetId ?? '',
        estimatedMonthlyCostUsd: NAT_MONTHLY,
      }));
  }

  private async listVpcs(
    region: string,
    credentials: SessionCreds,
    accountId: string,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const ec2 = new EC2Client({ region, credentials });
    const result = await ec2.send(new DescribeVpcsCommand({}));
    return (result.Vpcs ?? []).map((v) => ({
      resourceType: 'vpc',
      resourceId: v.VpcId ?? 'unknown',
      resourceArn: `arn:aws:ec2:${region}:${accountId}:vpc/${v.VpcId}`,
      region,
      state: v.State ?? 'available',
      detail: v.CidrBlock ?? (v.IsDefault ? 'default' : ''),
      estimatedMonthlyCostUsd: 0,
    }));
  }

  private async listSecurityGroups(
    region: string,
    credentials: SessionCreds,
    accountId: string,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const ec2 = new EC2Client({ region, credentials });
    const result = await ec2.send(new DescribeSecurityGroupsCommand({}));
    return (result.SecurityGroups ?? []).map((sg) => ({
      resourceType: 'sg',
      resourceId: sg.GroupId ?? 'unknown',
      resourceArn: `arn:aws:ec2:${region}:${accountId}:security-group/${sg.GroupId}`,
      region,
      state: 'active',
      detail: sg.GroupName ?? '',
      estimatedMonthlyCostUsd: 0,
    }));
  }

  private async listRds(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const rds = new RDSClient({ region, credentials });
    const result = await rds.send(new DescribeDBInstancesCommand({}));
    return (result.DBInstances ?? []).map((db) => ({
      resourceType: 'rds',
      resourceId: db.DBInstanceIdentifier ?? 'unknown',
      resourceArn: db.DBInstanceArn ?? '',
      region,
      state: db.DBInstanceStatus ?? 'unknown',
      detail: `${db.Engine ?? ''} ${db.DBInstanceClass ?? ''}`.trim(),
      estimatedMonthlyCostUsd: 80,
    }));
  }

  private async listRdsClusters(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const rds = new RDSClient({ region, credentials });
    const result = await rds.send(new DescribeDBClustersCommand({}));
    return (result.DBClusters ?? []).map((c) => ({
      resourceType: 'rds-cluster',
      resourceId: c.DBClusterIdentifier ?? 'unknown',
      resourceArn: c.DBClusterArn ?? '',
      region,
      state: c.Status ?? 'unknown',
      detail: c.Engine ?? '',
      estimatedMonthlyCostUsd: 0,
    }));
  }

  private async listLambda(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const lambda = new LambdaClient({ region, credentials });
    const out: InventoryListedResourceSnapshot[] = [];
    let marker: string | undefined;
    do {
      const page = await lambda.send(
        new ListFunctionsCommand({ Marker: marker, MaxItems: 50 }),
      );
      for (const fn of page.Functions ?? []) {
        out.push({
          resourceType: 'lambda',
          resourceId: fn.FunctionName ?? 'unknown',
          resourceArn: fn.FunctionArn ?? '',
          region,
          state: fn.State ?? 'Active',
          detail: `${fn.Runtime ?? ''} · ${fn.MemorySize ?? 0} MB`,
          estimatedMonthlyCostUsd: 0,
        });
      }
      marker = page.NextMarker;
    } while (marker);
    return out;
  }

  private async listElb(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const elb = new ElasticLoadBalancingV2Client({ region, credentials });
    const result = await elb.send(new DescribeLoadBalancersCommand({}));
    return (result.LoadBalancers ?? []).map((lb) => ({
      resourceType: 'elb',
      resourceId: lb.LoadBalancerName ?? lb.LoadBalancerArn?.split('/').pop() ?? 'unknown',
      resourceArn: lb.LoadBalancerArn ?? '',
      region,
      state: lb.State?.Code ?? 'active',
      detail: lb.Type ?? 'alb',
      estimatedMonthlyCostUsd: ALB_MONTHLY,
    }));
  }

  private async listEcs(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const ecs = new ECSClient({ region, credentials });
    const clusters = await ecs.send(new ListClustersCommand({}));
    const out: InventoryListedResourceSnapshot[] = [];
    for (const clusterArn of clusters.clusterArns ?? []) {
      const clusterName = clusterArn.split('/').pop() ?? clusterArn;
      out.push({
        resourceType: 'ecs-cluster',
        resourceId: clusterName,
        resourceArn: clusterArn,
        region,
        state: 'active',
        detail: 'ECS cluster',
        estimatedMonthlyCostUsd: 0,
      });
      const services = await ecs.send(
        new ListServicesCommand({ cluster: clusterArn, maxResults: 100 }),
      );
      const arns = services.serviceArns ?? [];
      for (let i = 0; i < arns.length; i += 10) {
        const chunk = arns.slice(i, i + 10);
        const described = await ecs.send(
          new DescribeServicesCommand({ cluster: clusterArn, services: chunk }),
        );
        for (const svc of described.services ?? []) {
          out.push({
            resourceType: 'ecs-service',
            resourceId: svc.serviceName ?? 'unknown',
            resourceArn: svc.serviceArn ?? '',
            region,
            state: svc.status ?? 'ACTIVE',
            detail: `desired ${svc.desiredCount ?? 0} · running ${svc.runningCount ?? 0}`,
            estimatedMonthlyCostUsd: 0,
          });
        }
      }
    }
    return out;
  }

  private async listDynamo(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const ddb = new DynamoDBClient({ region, credentials });
    const out: InventoryListedResourceSnapshot[] = [];
    let startKey: string | undefined;
    do {
      const page = await ddb.send(
        new ListTablesCommand({ ExclusiveStartTableName: startKey, Limit: 100 }),
      );
      for (const name of page.TableNames ?? []) {
        let detail = 'table';
        try {
          const desc = await ddb.send(new DescribeTableCommand({ TableName: name }));
          detail = desc.Table?.BillingModeSummary?.BillingMode ?? desc.Table?.TableStatus ?? 'table';
          out.push({
            resourceType: 'dynamodb',
            resourceId: name,
            resourceArn: desc.Table?.TableArn ?? `arn:aws:dynamodb:${region}:table/${name}`,
            region,
            state: desc.Table?.TableStatus ?? 'ACTIVE',
            detail,
            estimatedMonthlyCostUsd: 0,
          });
        } catch {
          out.push({
            resourceType: 'dynamodb',
            resourceId: name,
            resourceArn: `arn:aws:dynamodb:${region}:table/${name}`,
            region,
            state: 'ACTIVE',
            detail,
            estimatedMonthlyCostUsd: 0,
          });
        }
      }
      startKey = page.LastEvaluatedTableName;
    } while (startKey);
    return out;
  }

  private async listSqs(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const sqs = new SQSClient({ region, credentials });
    const result = await sqs.send(new ListQueuesCommand({}));
    return (result.QueueUrls ?? []).map((url) => {
      const name = url.split('/').pop() ?? url;
      return {
        resourceType: 'sqs',
        resourceId: name,
        resourceArn: url,
        region,
        state: 'active',
        detail: 'queue',
        estimatedMonthlyCostUsd: 0,
      };
    });
  }

  private async listSns(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const sns = new SNSClient({ region, credentials });
    const result = await sns.send(new ListTopicsCommand({}));
    return (result.Topics ?? []).map((t) => {
      const arn = t.TopicArn ?? '';
      return {
        resourceType: 'sns',
        resourceId: arn.split(':').pop() ?? arn,
        resourceArn: arn,
        region,
        state: 'active',
        detail: 'topic',
        estimatedMonthlyCostUsd: 0,
      };
    });
  }

  private async listTagged(
    region: string,
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const client = new ResourceGroupsTaggingAPIClient({ region, credentials });
    const out: InventoryListedResourceSnapshot[] = [];
    const paginator = paginateGetResources({ client }, { ResourcesPerPage: 100 });
    for await (const page of paginator) {
      for (const r of page.ResourceTagMappingList ?? []) {
        const arn = r.ResourceARN;
        if (!arn) continue;
        const resourceType = normalizeTaggedType(arn);
        // Evitar ruido duplicado de tipos que ya listamos con detalle.
        if (['ec2', 'ebs', 'eip'].includes(resourceType)) continue;
        out.push({
          resourceType,
          resourceId: idFromArn(arn),
          resourceArn: arn,
          region: regionFromArn(arn) || region,
          state: 'tagged',
          detail: (r.Tags ?? [])
            .slice(0, 3)
            .map((t) => `${t.Key}=${t.Value}`)
            .join(' · '),
          estimatedMonthlyCostUsd: 0,
        });
      }
    }
    return out;
  }

  private async listS3(
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const s3 = new S3Client({ region: 'us-east-1', credentials });
    const result = await s3.send(new ListBucketsCommand({}));
    return (result.Buckets ?? []).map((b) => ({
      resourceType: 's3',
      resourceId: b.Name ?? 'unknown',
      resourceArn: `arn:aws:s3:::${b.Name}`,
      region: 'global',
      state: 'active',
      detail: b.CreationDate ? `created ${b.CreationDate.toISOString().slice(0, 10)}` : 'bucket',
      estimatedMonthlyCostUsd: 0,
    }));
  }

  private async listIamUsers(
    credentials: SessionCreds,
    accountId: string,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const iam = new IAMClient({ region: 'us-east-1', credentials });
    const out: InventoryListedResourceSnapshot[] = [];
    let marker: string | undefined;
    do {
      const page = await iam.send(new ListUsersCommand({ Marker: marker, MaxItems: 100 }));
      for (const u of page.Users ?? []) {
        out.push({
          resourceType: 'iam-user',
          resourceId: u.UserName ?? 'unknown',
          resourceArn: u.Arn ?? `arn:aws:iam::${accountId}:user/${u.UserName}`,
          region: 'global',
          state: 'active',
          detail: u.CreateDate ? `created ${u.CreateDate.toISOString().slice(0, 10)}` : 'user',
          estimatedMonthlyCostUsd: 0,
        });
      }
      marker = page.IsTruncated ? page.Marker : undefined;
    } while (marker);
    return out;
  }

  private async listIamRoles(
    credentials: SessionCreds,
    accountId: string,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const iam = new IAMClient({ region: 'us-east-1', credentials });
    const out: InventoryListedResourceSnapshot[] = [];
    let marker: string | undefined;
    do {
      const page = await iam.send(new ListRolesCommand({ Marker: marker, MaxItems: 100 }));
      for (const role of page.Roles ?? []) {
        const name = role.RoleName ?? 'unknown';
        // Omitir roles de servicio AWS ruidosos.
        if (name.startsWith('AWSServiceRoleFor') || name.startsWith('stacksets-exec-')) {
          continue;
        }
        out.push({
          resourceType: 'iam-role',
          resourceId: name,
          resourceArn: role.Arn ?? `arn:aws:iam::${accountId}:role/${name}`,
          region: 'global',
          state: 'active',
          detail: role.Description?.slice(0, 80) ?? 'role',
          estimatedMonthlyCostUsd: 0,
        });
      }
      marker = page.IsTruncated ? page.Marker : undefined;
    } while (marker);
    return out;
  }

  private async listCloudFront(
    credentials: SessionCreds,
  ): Promise<InventoryListedResourceSnapshot[]> {
    const cf = new CloudFrontClient({ region: 'us-east-1', credentials });
    const result = await cf.send(new ListDistributionsCommand({}));
    return (result.DistributionList?.Items ?? []).map((d) => ({
      resourceType: 'cloudfront',
      resourceId: d.Id ?? 'unknown',
      resourceArn: d.ARN ?? '',
      region: 'global',
      state: d.Status ?? 'Deployed',
      detail: d.DomainName ?? d.Comment ?? 'distribution',
      estimatedMonthlyCostUsd: 0,
    }));
  }
}

/** @deprecated Preferí AssumeRoleAwsInventoryAdapter. */
export { AssumeRoleAwsInventoryAdapter as McpAwsInventoryAdapter };
