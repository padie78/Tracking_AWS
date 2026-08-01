import { Money } from '../value-objects/money';
import { RemediationStep } from '../value-objects/remediation-step';
import type { RemediationStepProps } from '../value-objects/remediation-step';

export interface SavingsDossierProps {
  tenantId: string;
  dossierId: string;
  scanId: string;
  accountId: string;
  title: string;
  markdownBody: string;
  totalEstimatedMonthlySavings: Money;
  findingIds: readonly string[];
  remediationSteps: readonly RemediationStep[];
  createdAtIso: string;
}

export class SavingsDossier {
  private constructor(private readonly props: SavingsDossierProps) {}

  static create(input: {
    tenantId: string;
    dossierId: string;
    scanId: string;
    accountId: string;
    title: string;
    markdownBody: string;
    totalEstimatedMonthlySavingsUsd: number;
    findingIds: string[];
    remediationSteps: RemediationStepProps[];
    createdAtIso?: string;
  }): SavingsDossier {
    return new SavingsDossier({
      tenantId: input.tenantId,
      dossierId: input.dossierId,
      scanId: input.scanId,
      accountId: input.accountId,
      title: input.title.trim(),
      markdownBody: input.markdownBody,
      totalEstimatedMonthlySavings: Money.from(
        input.totalEstimatedMonthlySavingsUsd,
        'USD',
      ),
      findingIds: [...input.findingIds],
      remediationSteps: input.remediationSteps.map((s) => RemediationStep.from(s)),
      createdAtIso: input.createdAtIso ?? new Date().toISOString(),
    });
  }

  static reconstitute(props: SavingsDossierProps): SavingsDossier {
    return new SavingsDossier(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get dossierId(): string {
    return this.props.dossierId;
  }

  get scanId(): string {
    return this.props.scanId;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get title(): string {
    return this.props.title;
  }

  get markdownBody(): string {
    return this.props.markdownBody;
  }

  get totalEstimatedMonthlySavings(): Money {
    return this.props.totalEstimatedMonthlySavings;
  }

  get findingIds(): readonly string[] {
    return this.props.findingIds;
  }

  get remediationSteps(): readonly RemediationStep[] {
    return this.props.remediationSteps;
  }

  get createdAtIso(): string {
    return this.props.createdAtIso;
  }
}
