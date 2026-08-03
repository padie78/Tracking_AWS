export type AuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type FindingDomain = 'finops' | 'secops' | 'architecture';

export type FinOpsCategory = 'rightsizing' | 'modernization' | 'orphaned';

export type SecOpsCategory = 'cis' | 'iam' | 'network' | 'storage' | 'compliance';

export type ArchitectureCategory =
  | 'operational_excellence'
  | 'security'
  | 'reliability'
  | 'performance'
  | 'cost'
  | 'sustainability';

export interface AuditFindingProps {
  tenantId: string;
  auditId: string;
  findingId: string;
  domain: FindingDomain;
  category: string;
  severity: AuditSeverity;
  resourceArn: string;
  resourceId: string;
  region: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  estimatedMonthlySavingsUsd: number;
  checkId: string | null;
  friendlyHeadline?: string | null;
  friendlyWhy?: string | null;
  friendlyAction?: string | null;
  friendlyArea?: string | null;
  friendlyHeadlineEs?: string | null;
  friendlyWhyEs?: string | null;
  friendlyActionEs?: string | null;
  friendlyAreaEs?: string | null;
  friendlyHeadlineEn?: string | null;
  friendlyWhyEn?: string | null;
  friendlyActionEn?: string | null;
  friendlyAreaEn?: string | null;
  createdAtIso: string;
}

export class AuditFinding {
  private constructor(private readonly props: AuditFindingProps) {}

  static create(input: Omit<AuditFindingProps, 'createdAtIso'> & {
    createdAtIso?: string;
  }): AuditFinding {
    return new AuditFinding({
      ...input,
      createdAtIso: input.createdAtIso ?? new Date().toISOString(),
    });
  }

  static reconstitute(props: AuditFindingProps): AuditFinding {
    return new AuditFinding(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get auditId(): string {
    return this.props.auditId;
  }
  get findingId(): string {
    return this.props.findingId;
  }
  get domain(): FindingDomain {
    return this.props.domain;
  }
  get category(): string {
    return this.props.category;
  }
  get severity(): AuditSeverity {
    return this.props.severity;
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
  get recommendedAction(): string {
    return this.props.recommendedAction;
  }
  get estimatedMonthlySavingsUsd(): number {
    return this.props.estimatedMonthlySavingsUsd;
  }
  get checkId(): string | null {
    return this.props.checkId;
  }
  get friendlyHeadline(): string | null {
    return this.props.friendlyHeadline ?? null;
  }
  get friendlyWhy(): string | null {
    return this.props.friendlyWhy ?? null;
  }
  get friendlyAction(): string | null {
    return this.props.friendlyAction ?? null;
  }
  get friendlyArea(): string | null {
    return this.props.friendlyArea ?? null;
  }
  get friendlyHeadlineEs(): string | null {
    return this.props.friendlyHeadlineEs ?? null;
  }
  get friendlyWhyEs(): string | null {
    return this.props.friendlyWhyEs ?? null;
  }
  get friendlyActionEs(): string | null {
    return this.props.friendlyActionEs ?? null;
  }
  get friendlyAreaEs(): string | null {
    return this.props.friendlyAreaEs ?? null;
  }
  get friendlyHeadlineEn(): string | null {
    return this.props.friendlyHeadlineEn ?? null;
  }
  get friendlyWhyEn(): string | null {
    return this.props.friendlyWhyEn ?? null;
  }
  get friendlyActionEn(): string | null {
    return this.props.friendlyActionEn ?? null;
  }
  get friendlyAreaEn(): string | null {
    return this.props.friendlyAreaEn ?? null;
  }
  get createdAtIso(): string {
    return this.props.createdAtIso;
  }

  toFinOpsFinding(): FinOpsFinding {
    return {
      findingId: this.findingId,
      category: this.category as FinOpsCategory,
      severity: this.severity,
      resourceArn: this.resourceArn,
      resourceId: this.resourceId,
      region: this.region,
      title: this.title,
      rationale: this.rationale,
      recommendedAction: this.recommendedAction,
      estimatedMonthlySavingsUsd: this.estimatedMonthlySavingsUsd,
    };
  }

  toProwlerFinding(): ProwlerFinding {
    return {
      findingId: this.findingId,
      checkId: this.checkId ?? this.category,
      severity: this.severity,
      resourceArn: this.resourceArn,
      resourceId: this.resourceId,
      region: this.region,
      title: this.title,
      rationale: this.rationale,
      recommendedAction: this.recommendedAction,
      complianceFramework: this.category,
    };
  }
}

export interface FinOpsFinding {
  findingId: string;
  category: FinOpsCategory;
  severity: AuditSeverity;
  resourceArn: string;
  resourceId: string;
  region: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  estimatedMonthlySavingsUsd: number;
}

export interface ProwlerFinding {
  findingId: string;
  checkId: string;
  severity: AuditSeverity;
  resourceArn: string;
  resourceId: string;
  region: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  complianceFramework: string;
}

export interface AuditPayload {
  tenantId: string;
  auditId: string;
  accountId: string;
  roleArn: string;
  externalId: string;
  regions: string[];
  correlationId: string;
}
