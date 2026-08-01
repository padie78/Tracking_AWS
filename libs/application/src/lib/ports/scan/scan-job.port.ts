import type { ScanJob } from '@track-aws/domain';

export interface IScanJobWriter {
  save(scan: ScanJob): Promise<void>;
}

export interface IScanJobReader {
  findById(tenantId: string, scanId: string): Promise<ScanJob | null>;
  findLatestByAccount(
    tenantId: string,
    accountId: string,
  ): Promise<ScanJob | null>;
}

export interface IScanEventNotifier {
  publishScanStatusChanged(input: {
    tenantId: string;
    scanId: string;
    accountId: string;
    status: string;
    findingCount: number;
    estimatedMonthlySavingsUsd: number;
  }): Promise<void>;
}
