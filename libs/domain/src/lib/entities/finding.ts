import { FindingCategory } from '../value-objects/finding-category';
import type { FindingCategoryValue } from '../value-objects/finding-category';
import { Money } from '../value-objects/money';

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FindingProps {
  tenantId: string;
  scanId: string;
  findingId: string;
  category: FindingCategoryValue;
  resourceArn: string;
  resourceId: string;
  region: string;
  title: string;
  rationale: string;
  severity: FindingSeverity;
  estimatedMonthlySavings: Money;
  recommendedAction: string;
  createdAtIso: string;
  ttlEpochSeconds: number | null;
}

export class Finding {
  private constructor(private readonly props: FindingProps) {}

  static create(input: {
    tenantId: string;
    scanId: string;
    findingId: string;
    category: string;
    resourceArn: string;
    resourceId: string;
    region: string;
    title: string;
    rationale: string;
    severity: FindingSeverity;
    estimatedMonthlySavingsUsd: number;
    recommendedAction: string;
    createdAtIso?: string;
    ttlEpochSeconds?: number | null;
  }): Finding {
    const category = FindingCategory.from(input.category);
    return new Finding({
      tenantId: input.tenantId,
      scanId: input.scanId,
      findingId: input.findingId,
      category: category.value,
      resourceArn: input.resourceArn,
      resourceId: input.resourceId,
      region: input.region,
      title: input.title.trim(),
      rationale: input.rationale.trim(),
      severity: input.severity,
      estimatedMonthlySavings: Money.from(input.estimatedMonthlySavingsUsd, 'USD'),
      recommendedAction: input.recommendedAction.trim(),
      createdAtIso: input.createdAtIso ?? new Date().toISOString(),
      ttlEpochSeconds: input.ttlEpochSeconds ?? null,
    });
  }

  static reconstitute(props: FindingProps): Finding {
    return new Finding(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get scanId(): string {
    return this.props.scanId;
  }

  get findingId(): string {
    return this.props.findingId;
  }

  get category(): FindingCategoryValue {
    return this.props.category;
  }

  get resourceArn(): string {
    return this.props.resourceArn;
  }

  get resourceId(): string {
    return this.props.resourceId;
  }

  get region(): string {
    return this.props.region;
  }

  get title(): string {
    return this.props.title;
  }

  get rationale(): string {
    return this.props.rationale;
  }

  get severity(): FindingSeverity {
    return this.props.severity;
  }

  get estimatedMonthlySavings(): Money {
    return this.props.estimatedMonthlySavings;
  }

  get recommendedAction(): string {
    return this.props.recommendedAction;
  }

  get createdAtIso(): string {
    return this.props.createdAtIso;
  }

  get ttlEpochSeconds(): number | null {
    return this.props.ttlEpochSeconds;
  }
}
