export type InventoryResourceType = 'ec2' | 'ebs' | 'eip';

export interface InventoryResourceView {
  resourceType: InventoryResourceType;
  resourceId: string;
  resourceArn: string;
  region: string;
  state: string;
  detail: string;
  estimatedMonthlyCostUsd: number;
}

export interface AccountInventoryView {
  accountId: string;
  capturedAtIso: string;
  source: 'live' | 'audit';
  auditId: string | null;
  summary: {
    ec2Count: number;
    ebsCount: number;
    eipCount: number;
    runningEc2Count: number;
    stoppedEc2Count: number;
    unattachedEbsCount: number;
    idleEipCount: number;
  };
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
