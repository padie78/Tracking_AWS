import {
  AuditJob,
  AwsAccountLinkNotFoundError,
} from '@track-aws/domain';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type { IAwsAccountLinkReader } from '../../ports/accounts/aws-account-link.port';
import type { IAuditJobWriter } from '../../ports/audit/audit-job.port';
import type { IAuditEventNotifier } from '../../ports/audit/audit-event.port';
import type { IMockScanPipeline } from '../../ports/audit/mock-scan-pipeline.port';
import {
  StartAuditInputSchema,
  type StartAuditInputDto,
} from '../../dto/audit/audit.dto';

export interface SimulateMockScanDeps {
  accountLinks: IAwsAccountLinkReader;
  auditWriter: IAuditJobWriter;
  pipeline: IMockScanPipeline;
  idGenerator: IIdGenerator;
  auditNotifier?: IAuditEventNotifier;
  logger?: ILogger;
}

/**
 * Simula el scanner: crea AuditJob, deja 5 artefactos en S3 y dispara
 * aggregate (+ ETL) con el mismo contrato que Step Functions.
 */
export class SimulateMockScanUseCase {
  constructor(private readonly deps: SimulateMockScanDeps) {}

  async execute(raw: unknown): Promise<{
    auditId: string;
    correlationId: string;
    executionArn: string;
    artifactKeys: string[];
  }> {
    const input: StartAuditInputDto = StartAuditInputSchema.parse(raw);

    const link = await this.deps.accountLinks.findByAccount(
      input.tenantId,
      input.accountId,
    );
    if (!link || !link.isScannable()) {
      throw new AwsAccountLinkNotFoundError(input.tenantId, input.accountId);
    }

    const auditId = this.deps.idGenerator.generate();
    const correlationId = this.deps.idGenerator.generate();

    let audit = AuditJob.create({
      tenantId: input.tenantId,
      auditId,
      accountId: input.accountId,
      correlationId,
    });
    const executionArn = `mock-scan:${auditId}`;
    audit = audit.withExecutionArn(executionArn).withStatus('running');
    await this.deps.auditWriter.save(audit);

    await this.deps.auditNotifier?.publishAuditStatusChanged({
      tenantId: audit.tenantId,
      auditId: audit.auditId,
      accountId: audit.accountId,
      status: audit.status,
      findingCount: audit.findingCount,
      criticalCount: audit.criticalCount,
      highCount: audit.highCount,
      globalScore: audit.globalScore,
      estimatedMonthlySavingsUsd: audit.estimatedMonthlySavingsUsd,
    });

    const refs = await this.deps.pipeline.writeArtifactsAndStartAggregate({
      tenantId: input.tenantId,
      auditId,
      accountId: input.accountId,
      correlationId,
      regions: input.regions,
    });

    audit = audit.withStatus('aggregating');
    await this.deps.auditWriter.save(audit);
    await this.deps.auditNotifier?.publishAuditStatusChanged({
      tenantId: audit.tenantId,
      auditId: audit.auditId,
      accountId: audit.accountId,
      status: audit.status,
      findingCount: audit.findingCount,
      criticalCount: audit.criticalCount,
      highCount: audit.highCount,
      globalScore: audit.globalScore,
      estimatedMonthlySavingsUsd: audit.estimatedMonthlySavingsUsd,
    });

    this.deps.logger?.info('Mock scan orquestado (S3 + aggregate/ETL)', {
      tenantId: input.tenantId,
      auditId,
      keys: Object.values(refs.keys),
    });

    return {
      auditId,
      correlationId,
      executionArn,
      artifactKeys: Object.values(refs.keys),
    };
  }
}
