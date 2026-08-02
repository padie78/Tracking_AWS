import type {
  AwsInventorySnapshot,
  InventoryResourceView,
} from '@track-aws/application';

/** Convierte snapshot AssumeRole → filas de inventario (catálogo completo). */
export function snapshotToResources(
  snapshot: AwsInventorySnapshot,
): InventoryResourceView[] {
  if (snapshot.listedResources?.length) {
    return snapshot.listedResources.map((r) => ({ ...r }));
  }
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
