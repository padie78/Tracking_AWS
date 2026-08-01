import type { SubscriptionPlan } from './tenant';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface SubscriptionProps {
  tenantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  seats: number;
  renewsAtIso: string | null;
}

/** Stub multi-tenant SaaS — enforcement de plan en fases posteriores. */
export class Subscription {
  private constructor(private readonly props: SubscriptionProps) {}

  static create(input: {
    tenantId: string;
    plan?: SubscriptionPlan;
    status?: SubscriptionStatus;
    seats?: number;
    renewsAtIso?: string | null;
  }): Subscription {
    return new Subscription({
      tenantId: input.tenantId,
      plan: input.plan ?? 'starter',
      status: input.status ?? 'trialing',
      seats: input.seats ?? 5,
      renewsAtIso: input.renewsAtIso ?? null,
    });
  }

  static reconstitute(props: SubscriptionProps): Subscription {
    return new Subscription(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get plan(): SubscriptionPlan {
    return this.props.plan;
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }

  get seats(): number {
    return this.props.seats;
  }

  get renewsAtIso(): string | null {
    return this.props.renewsAtIso;
  }

  isActive(): boolean {
    return this.props.status === 'active' || this.props.status === 'trialing';
  }
}
