export type AwsAccountLinkStatus = 'pending' | 'active' | 'error' | 'revoked';

export interface AwsAccountLinkProps {
  tenantId: string;
  accountId: string;
  displayName: string;
  /** ARN del rol en la cuenta del cliente (cross-account). */
  roleArn: string;
  /** External ID anti confused-deputy (generado por Track_AWS). */
  externalId: string;
  /** Regiones a escanear (vacío = default us-east-1 + eu-central-1). */
  regions: readonly string[];
  status: AwsAccountLinkStatus;
  linkedAtIso: string;
  verifiedAtIso: string | null;
}

/**
 * Vínculo tenant ↔ cuenta AWS del cliente.
 * Sin credenciales largas: solo roleArn + externalId para sts:AssumeRole.
 */
export class AwsAccountLink {
  private constructor(private readonly props: AwsAccountLinkProps) {}

  static create(input: {
    tenantId: string;
    accountId: string;
    displayName: string;
    roleArn: string;
    externalId: string;
    regions?: string[];
    linkedAtIso?: string;
  }): AwsAccountLink {
    const accountId = input.accountId.trim();
    if (!/^\d{12}$/.test(accountId)) {
      throw new Error(`accountId inválido: ${input.accountId}`);
    }
    return new AwsAccountLink({
      tenantId: input.tenantId,
      accountId,
      displayName: input.displayName.trim() || accountId,
      roleArn: input.roleArn.trim(),
      externalId: input.externalId.trim(),
      regions: (input.regions ?? []).map((r) => r.trim()).filter(Boolean),
      status: 'pending',
      linkedAtIso: input.linkedAtIso ?? new Date().toISOString(),
      verifiedAtIso: null,
    });
  }

  static reconstitute(props: AwsAccountLinkProps): AwsAccountLink {
    return new AwsAccountLink(props);
  }

  static buildRoleArn(accountId: string, roleName = 'TrackAwsScannerRole'): string {
    return `arn:aws:iam::${accountId}:role/${roleName}`;
  }

  markActive(verifiedAtIso?: string): AwsAccountLink {
    return new AwsAccountLink({
      ...this.props,
      status: 'active',
      verifiedAtIso: verifiedAtIso ?? new Date().toISOString(),
    });
  }

  markError(): AwsAccountLink {
    return new AwsAccountLink({ ...this.props, status: 'error' });
  }

  markRevoked(): AwsAccountLink {
    return new AwsAccountLink({ ...this.props, status: 'revoked' });
  }

  withRegions(regions: string[]): AwsAccountLink {
    return new AwsAccountLink({
      ...this.props,
      regions: regions.map((r) => r.trim()).filter(Boolean),
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get roleArn(): string {
    return this.props.roleArn;
  }

  get externalId(): string {
    return this.props.externalId;
  }

  get regions(): readonly string[] {
    return this.props.regions;
  }

  get status(): AwsAccountLinkStatus {
    return this.props.status;
  }

  get linkedAtIso(): string {
    return this.props.linkedAtIso;
  }

  get verifiedAtIso(): string | null {
    return this.props.verifiedAtIso;
  }

  isScannable(): boolean {
    return this.props.status === 'active' || this.props.status === 'pending';
  }
}
