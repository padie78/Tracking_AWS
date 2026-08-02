export interface AuditReportInventorySummary {
  totalCount: number;
  ec2Count: number;
  ebsCount: number;
  eipCount: number;
  runningEc2Count: number;
  stoppedEc2Count: number;
  unattachedEbsCount: number;
  idleEipCount: number;
}

export interface AuditReportRecordView {
  tenantId: string;
  auditId: string;
  reportId: string;
  accountId: string;
  markdownBody: string;
  aiGenerated: boolean;
  inventorySummary: AuditReportInventorySummary | null;
  s3Key: string;
  createdAtIso: string;
  globalScore: number;
  estimatedMonthlySavingsUsd: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
}

export interface IAuditReportReader {
  findByAuditId(
    tenantId: string,
    auditId: string,
  ): Promise<AuditReportRecordView | null>;
}
