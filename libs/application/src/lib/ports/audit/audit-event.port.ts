export interface IAuditEventNotifier {
  publishAuditStatusChanged(input: {
    tenantId: string;
    auditId: string;
    accountId: string;
    status: string;
    findingCount: number;
    criticalCount: number;
    highCount: number;
    globalScore: number;
    estimatedMonthlySavingsUsd: number;
  }): Promise<void>;
}
