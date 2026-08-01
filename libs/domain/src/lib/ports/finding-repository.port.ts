import type { Finding } from '../entities/finding';
import type { FindingCategoryValue } from '../value-objects/finding-category';

export interface IFindingRepository {
  save(finding: Finding): Promise<void>;
  listByScan(tenantId: string, scanId: string): Promise<Finding[]>;
  listByCategory(
    tenantId: string,
    category: FindingCategoryValue,
  ): Promise<Finding[]>;
}
