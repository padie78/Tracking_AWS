export type AuditStatus =
  | 'queued'
  | 'assuming_role'
  | 'running'
  | 'aggregating'
  | 'completed'
  | 'failed';

export type WafPillarScores = {
  operationalExcellence: number;
  security: number;
  reliability: number;
  performanceEfficiency: number;
  costOptimization: number;
  sustainability: number;
};

export interface AuditJobProps {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
  status: AuditStatus;
  executionArn: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  estimatedMonthlySavingsUsd: number;
  globalScore: number;
  pillarScores: WafPillarScores;
  errorMessage: string | null;
}

const DEFAULT_PILLARS: WafPillarScores = {
  operationalExcellence: 0,
  security: 0,
  reliability: 0,
  performanceEfficiency: 0,
  costOptimization: 0,
  sustainability: 0,
};

export class AuditJob {
  private constructor(private readonly props: AuditJobProps) {}

  static create(input: {
    tenantId: string;
    auditId: string;
    accountId: string;
    correlationId: string;
    createdAtIso?: string;
  }): AuditJob {
    return new AuditJob({
      tenantId: input.tenantId,
      auditId: input.auditId,
      accountId: input.accountId,
      correlationId: input.correlationId,
      status: 'queued',
      executionArn: null,
      createdAtIso: input.createdAtIso ?? new Date().toISOString(),
      completedAtIso: null,
      findingCount: 0,
      criticalCount: 0,
      highCount: 0,
      estimatedMonthlySavingsUsd: 0,
      globalScore: 0,
      pillarScores: { ...DEFAULT_PILLARS },
      errorMessage: null,
    });
  }

  static reconstitute(props: AuditJobProps): AuditJob {
    return new AuditJob(props);
  }

  withStatus(status: AuditStatus): AuditJob {
    return new AuditJob({ ...this.props, status });
  }

  withExecutionArn(executionArn: string): AuditJob {
    return new AuditJob({ ...this.props, executionArn });
  }

  withFailure(message: string): AuditJob {
    return new AuditJob({
      ...this.props,
      status: 'failed',
      errorMessage: message,
      completedAtIso: new Date().toISOString(),
    });
  }

  withAggregation(input: {
    findingCount: number;
    criticalCount: number;
    highCount: number;
    estimatedMonthlySavingsUsd: number;
    pillarScores: WafPillarScores;
  }): AuditJob {
    const values = Object.values(input.pillarScores);
    const globalScore =
      values.length === 0
        ? 0
        : Math.round(
            (values.reduce((a, b) => a + b, 0) / values.length) * 100,
          ) / 100;
    return new AuditJob({
      ...this.props,
      status: 'completed',
      findingCount: input.findingCount,
      criticalCount: input.criticalCount,
      highCount: input.highCount,
      estimatedMonthlySavingsUsd: input.estimatedMonthlySavingsUsd,
      pillarScores: input.pillarScores,
      globalScore,
      completedAtIso: new Date().toISOString(),
      errorMessage: null,
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get auditId(): string {
    return this.props.auditId;
  }
  get accountId(): string {
    return this.props.accountId;
  }
  get correlationId(): string {
    return this.props.correlationId;
  }
  get status(): AuditStatus {
    return this.props.status;
  }
  get executionArn(): string | null {
    return this.props.executionArn;
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
  get criticalCount(): number {
    return this.props.criticalCount;
  }
  get highCount(): number {
    return this.props.highCount;
  }
  get estimatedMonthlySavingsUsd(): number {
    return this.props.estimatedMonthlySavingsUsd;
  }
  get globalScore(): number {
    return this.props.globalScore;
  }
  get pillarScores(): WafPillarScores {
    return this.props.pillarScores;
  }
  get errorMessage(): string | null {
    return this.props.errorMessage;
  }
}
