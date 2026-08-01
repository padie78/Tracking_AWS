import { InvalidFindingCategoryError } from '../errors/domain-errors';

export type FindingCategoryValue = 'rightsizing' | 'modernization' | 'orphaned';

const CATEGORIES: ReadonlySet<string> = new Set([
  'rightsizing',
  'modernization',
  'orphaned',
]);

export class FindingCategory {
  private constructor(public readonly value: FindingCategoryValue) {}

  static from(raw: string): FindingCategory {
    const normalized = raw.toLowerCase();
    if (!CATEGORIES.has(normalized)) {
      throw new InvalidFindingCategoryError(raw);
    }
    return new FindingCategory(normalized as FindingCategoryValue);
  }

  static all(): readonly FindingCategoryValue[] {
    return ['rightsizing', 'modernization', 'orphaned'];
  }

  toString(): string {
    return this.value;
  }
}
