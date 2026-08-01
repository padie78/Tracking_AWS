import {
  AuditJob,
  AwsAccountLinkNotFoundError,
} from '@track-aws/domain';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type { IAwsAccountLinkReader } from '../../ports/accounts/aws-account-link.port';
import type {
  IAuditJobWriter,
} from '../../ports/audit/audit-job.port';
import type { IAuditEventNotifier } from '../../ports/audit/audit-event.port';
import type { IAuditOrchestrator } from '../../ports/audit/audit-orchestrator.port';
import {
  StartAuditInputSchema,
  type StartAuditInputDto,
} from '../../dto/audit/audit.dto';

export interface StartAuditDeps {
  accountLinks: IAwsAccountLinkReader;
  auditWriter: IAuditJobWriter;
  orchestrator: IAuditOrchestrator;
  idGenerator: IIdGenerator;
  auditNotifier?: IAuditEventNotifier;
  logger?: ILogger;
}

export class StartAuditUseCase {
  constructor(private readonly deps: StartAuditDeps) {}

  async execute(raw: unknown): Promise<{
    auditId: string;
    correlationId: string;
    executionArn: string;
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
    await this.deps.auditWriter.save(audit);

    const { executionArn } = await this.deps.orchestrator.start({
      tenantId: input.tenantId,
      auditId,
      accountId: input.accountId,
      correlationId,
      regions: input.regions,
    });

    audit = audit.withExecutionArn(executionArn).withStatus('assuming_role');
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

    this.deps.logger?.info('Audit orquestado (Step Functions)', {
      tenantId: input.tenantId,
      auditId,
      executionArn,
    });

    return { auditId, correlationId, executionArn };
  }
}
