export interface InventoryResourceView {
  /** Tipo libre: ec2, ebs, eip, s3, rds, lambda, elb, … */
  resourceType: string;
  resourceId: string;
  resourceArn: string;
  region: string;
  state: string;
  detail: string;
  estimatedMonthlyCostUsd: number;
}

export interface InventorySummaryView {
  totalCount: number;
  ec2Count: number;
  ebsCount: number;
  eipCount: number;
  runningEc2Count: number;
  stoppedEc2Count: number;
  unattachedEbsCount: number;
  idleEipCount: number;
}

export interface AccountInventoryView {
  accountId: string;
  capturedAtIso: string;
  source: 'live' | 'audit';
  auditId: string | null;
  summary: InventorySummaryView;
  resources: InventoryResourceView[];
}

export interface IAuditInventoryWriter {
  saveMany(input: {
    tenantId: string;
    auditId: string;
    accountId: string;
    resources: InventoryResourceView[];
  }): Promise<void>;
}

export interface IAuditInventoryReader {
  listByAudit(
    tenantId: string,
    auditId: string,
  ): Promise<InventoryResourceView[]>;
}

export function summarizeInventoryResources(
  resources: InventoryResourceView[],
): InventorySummaryView {
  return {
    totalCount: resources.length,
    ec2Count: resources.filter((r) => r.resourceType === 'ec2').length,
    ebsCount: resources.filter((r) => r.resourceType === 'ebs').length,
    eipCount: resources.filter((r) => r.resourceType === 'eip').length,
    runningEc2Count: resources.filter(
      (r) => r.resourceType === 'ec2' && r.state === 'running',
    ).length,
    stoppedEc2Count: resources.filter(
      (r) => r.resourceType === 'ec2' && r.state === 'stopped',
    ).length,
    unattachedEbsCount: resources.filter(
      (r) => r.resourceType === 'ebs' && r.state === 'unattached',
    ).length,
    idleEipCount: resources.filter(
      (r) => r.resourceType === 'eip' && r.state === 'idle',
    ).length,
  };
}
