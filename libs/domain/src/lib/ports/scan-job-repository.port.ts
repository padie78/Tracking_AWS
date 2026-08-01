import type { ScanJob } from '../entities/scan-job';

export interface IScanJobRepository {
  save(scan: ScanJob): Promise<void>;
  findById(tenantId: string, scanId: string): Promise<ScanJob | null>;
  findLatestByAccount(
    tenantId: string,
    accountId: string,
  ): Promise<ScanJob | null>;
}
