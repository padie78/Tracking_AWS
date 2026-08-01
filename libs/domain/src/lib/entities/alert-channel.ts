import type {
  FindingDomain,
  AuditSeverity,
} from '../entities/audit-finding';

export type AlertChannelKind = 'webhook' | 'slack' | 'email';

export type AlertCategoryFilter =
  | 'security'
  | 'savings'
  | 'inconsistency'
  | 'all';

export interface AlertChannelProps {
  tenantId: string;
  channelId: string;
  kind: AlertChannelKind;
  /** URL webhook / Slack Incoming Webhook; email address si kind=email */
  target: string;
  label: string;
  categories: AlertCategoryFilter[];
  enabled: boolean;
  createdAtIso: string;
}

export class AlertChannel {
  private constructor(private readonly props: AlertChannelProps) {}

  static create(input: {
    tenantId: string;
    channelId: string;
    kind: AlertChannelKind;
    target: string;
    label?: string;
    categories?: AlertCategoryFilter[];
    createdAtIso?: string;
  }): AlertChannel {
    const target = input.target.trim();
    if (!target) throw new Error('AlertChannel target requerido');
    if (input.kind === 'email' && !target.includes('@')) {
      throw new Error('Email inválido');
    }
    if (
      (input.kind === 'webhook' || input.kind === 'slack') &&
      !/^https:\/\//i.test(target)
    ) {
      throw new Error('Webhook debe ser HTTPS');
    }
    return new AlertChannel({
      tenantId: input.tenantId,
      channelId: input.channelId,
      kind: input.kind,
      target,
      label: (input.label ?? input.kind).trim() || input.kind,
      categories: input.categories?.length ? [...input.categories] : ['all'],
      enabled: true,
      createdAtIso: input.createdAtIso ?? new Date().toISOString(),
    });
  }

  static reconstitute(props: AlertChannelProps): AlertChannel {
    return new AlertChannel({ ...props, categories: [...props.categories] });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get channelId(): string {
    return this.props.channelId;
  }
  get kind(): AlertChannelKind {
    return this.props.kind;
  }
  get target(): string {
    return this.props.target;
  }
  get label(): string {
    return this.props.label;
  }
  get categories(): AlertCategoryFilter[] {
    return [...this.props.categories];
  }
  get enabled(): boolean {
    return this.props.enabled;
  }
  get createdAtIso(): string {
    return this.props.createdAtIso;
  }

  accepts(category: AlertCategoryFilter): boolean {
    if (!this.enabled) return false;
    return (
      this.props.categories.includes('all') ||
      this.props.categories.includes(category)
    );
  }

  toProps(): AlertChannelProps {
    return {
      ...this.props,
      categories: [...this.props.categories],
    };
  }
}

export type DigestTip = {
  category: AlertCategoryFilter;
  severity: AuditSeverity;
  domain: FindingDomain;
  title: string;
  recommendedAction: string;
  estimatedMonthlySavingsUsd: number;
  resourceId: string;
};

/** Clasifica un finding para el digest de cliente. */
export function classifyAlertCategory(input: {
  domain: FindingDomain;
  category: string;
  severity: AuditSeverity;
  estimatedMonthlySavingsUsd: number;
}): AlertCategoryFilter {
  if (input.domain === 'secops') return 'security';
  if (
    input.estimatedMonthlySavingsUsd > 0 ||
    input.domain === 'finops' ||
    ['rightsizing', 'orphaned', 'modernization'].includes(input.category)
  ) {
    return 'savings';
  }
  return 'inconsistency';
}
