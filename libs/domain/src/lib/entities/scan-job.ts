import { InvalidScanStatusError } from '../errors/domain-errors';

export type ScanJobStatus =
  | 'queued'
  | 'scanning'
  | 'analyzing'
  | 'completed'
  | 'failed';

const SCAN_STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'scanning',
  'analyzing',
  'completed',
  'failed',
]);

export interface ScanJobProps {
  tenantId: string;
  scanId: string;
  accountId: string;
  status: ScanJobStatus;
  correlationId: string;
  createdAtIso: string;
  completedAtIso: string | null;
  findingCount: number;
  estimatedMonthlySavingsUsd: number;
}

export class ScanJob {
  private constructor(private readonly props: ScanJobProps) {}

  static create(input: {
    tenantId: string;
    scanId: string;
    accountId: string;
    correlationId: string;
    createdAtIso?: string;
  }): ScanJob {
    return new ScanJob({
      tenantId: input.tenantId,
      scanId: input.scanId,
      accountId: input.accountId,
      status: 'queued',
      correlationId: input.correlationId,
      createdAtIso: input.createdAtIso ?? new Date().toISOString(),
      completedAtIso: null,
      findingCount: 0,
      estimatedMonthlySavingsUsd: 0,
    });
  }

  static reconstitute(props: ScanJobProps): ScanJob {
    if (!SCAN_STATUSES.has(props.status)) {
      throw new InvalidScanStatusError(props.status);
    }
    return new ScanJob(props);
  }

  withStatus(status: ScanJobStatus): ScanJob {
    return new ScanJob({
      ...this.props,
      status,
      completedAtIso:
        status === 'completed' || status === 'failed'
          ? new Date().toISOString()
          : this.props.completedAtIso,
    });
  }

  withSummary(findingCount: number, estimatedMonthlySavingsUsd: number): ScanJob {
    return new ScanJob({
      ...this.props,
      findingCount,
      estimatedMonthlySavingsUsd,
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get scanId(): string {
    return this.props.scanId;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get status(): ScanJobStatus {
    return this.props.status;
  }

  get correlationId(): string {
    return this.props.correlationId;
  }

  get createdAtIso(): string {
    return this.props.createdAtIso;
  }

  get completedAtIso(): string | null {
    return this.props.completedAtIso;
  }

  get findingCount(): number {
    return this.props.findingCount;
  }

  get estimatedMonthlySavingsUsd(): number {
    return this.props.estimatedMonthlySavingsUsd;
  }
}
