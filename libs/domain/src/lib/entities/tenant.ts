export type SubscriptionPlan = 'free' | 'starter' | 'business' | 'enterprise';

export interface TenantProps {
  tenantId: string;
  name: string;
  plan: SubscriptionPlan;
  createdAtIso: string;
}

export class Tenant {
  private constructor(private readonly props: TenantProps) {}

  static create(input: {
    tenantId: string;
    name: string;
    plan?: SubscriptionPlan;
    createdAtIso?: string;
  }): Tenant {
    return new Tenant({
      tenantId: input.tenantId,
      name: input.name.trim(),
      plan: input.plan ?? 'starter',
      createdAtIso: input.createdAtIso ?? new Date().toISOString(),
    });
  }

  static reconstitute(props: TenantProps): Tenant {
    return new Tenant(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get name(): string {
    return this.props.name;
  }

  get plan(): SubscriptionPlan {
    return this.props.plan;
  }

  get createdAtIso(): string {
    return this.props.createdAtIso;
  }
}
