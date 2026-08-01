import { ScanJob, AwsAccountLinkNotFoundError } from '@track-aws/domain';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type { IScanJobWriter } from '../../ports/scan/scan-job.port';
import type { IScanQueuePublisher } from '../../ports/scan/scan-queue.port';
import type { IAwsAccountLinkReader } from '../../ports/accounts/aws-account-link.port';
import {
  EnqueueInventoryScanInputSchema,
  type EnqueueInventoryScanInputDto,
} from '../../dto/scan/scan-queue-message.dto';

export interface EnqueueInventoryScanDeps {
  scanWriter: IScanJobWriter;
  scanQueue: IScanQueuePublisher;
  accountLinks: IAwsAccountLinkReader;
  idGenerator: IIdGenerator;
  logger?: ILogger;
}

export class EnqueueInventoryScanUseCase {
  constructor(private readonly deps: EnqueueInventoryScanDeps) {}

  async execute(raw: unknown): Promise<{ scanId: string; correlationId: string }> {
    const input: EnqueueInventoryScanInputDto =
      EnqueueInventoryScanInputSchema.parse(raw);

    const link = await this.deps.accountLinks.findByAccount(
      input.tenantId,
      input.accountId,
    );
    if (!link || !link.isScannable()) {
      throw new AwsAccountLinkNotFoundError(input.tenantId, input.accountId);
    }

    const regions =
      input.regions?.length ? input.regions : [...link.regions];

    const scanId = this.deps.idGenerator.generate();
    const correlationId = this.deps.idGenerator.generate();

    const scan = ScanJob.create({
      tenantId: input.tenantId,
      scanId,
      accountId: input.accountId,
      correlationId,
    });

    await this.deps.scanWriter.save(scan);
    await this.deps.scanQueue.enqueue({
      tenantId: input.tenantId,
      scanId,
      accountId: input.accountId,
      roleArn: link.roleArn,
      externalId: link.externalId,
      regions,
      correlationId,
    });

    this.deps.logger?.info('Scan encolado', {
      tenantId: input.tenantId,
      scanId,
      accountId: input.accountId,
      correlationId,
    });

    return { scanId, correlationId };
  }
}
