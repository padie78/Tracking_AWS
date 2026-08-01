import type { Finding } from '@track-aws/domain';
import type { FindingCategoryValue } from '@track-aws/domain';

export interface IFindingWriter {
  save(finding: Finding): Promise<void>;
}

export interface IFindingReader {
  listByScan(tenantId: string, scanId: string): Promise<Finding[]>;
  listByCategory(
    tenantId: string,
    category: FindingCategoryValue,
  ): Promise<Finding[]>;
}

export interface IFindingEventNotifier {
  publishFindingReady(input: {
    tenantId: string;
    scanId: string;
    findingId: string;
    category: FindingCategoryValue;
    estimatedMonthlySavingsUsd: number;
    title: string;
  }): Promise<void>;
}
