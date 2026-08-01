import { ScanQueueMessageSchema } from '../../dto/scan/scan-queue-message.dto';
import type { ILogger } from '../../ports/shared/logger.port';
import type { IAwsInventoryPort } from '../../ports/mcp/mcp-aws-inventory.port';
import type {
  IScanJobReader,
  IScanJobWriter,
  IScanEventNotifier,
} from '../../ports/scan/scan-job.port';
import type {
  IRightsizingQueuePublisher,
  IModernizationQueuePublisher,
  IOrphanedQueuePublisher,
} from '../../ports/scan/scan-queue.port';

export interface ProcessInventoryScanDeps {
  awsInventory: IAwsInventoryPort;
  scanReader: IScanJobReader;
  scanWriter: IScanJobWriter;
  scanNotifier?: IScanEventNotifier;
  rightsizingQueue: IRightsizingQueuePublisher;
  modernizationQueue: IModernizationQueuePublisher;
  orphanedQueue: IOrphanedQueuePublisher;
  logger?: ILogger;
}

/**
 * Consume SQS(scan): AssumeRole → inventario efímero → fan-out a analyzers.
 * El inventoryPayload viaja solo al hop siguiente; no se persiste en DynamoDB.
 */
export class ProcessInventoryScanUseCase {
  constructor(private readonly deps: ProcessInventoryScanDeps) {}

  async execute(raw: unknown): Promise<void> {
    const message = ScanQueueMessageSchema.parse(raw);

    const existing = await this.deps.scanReader.findById(
      message.tenantId,
      message.scanId,
    );
    if (!existing) {
      this.deps.logger?.warn('ScanJob no encontrado', {
        scanId: message.scanId,
        tenantId: message.tenantId,
      });
      return;
    }

    const scanning = existing.withStatus('scanning');
    await this.deps.scanWriter.save(scanning);
    await this.deps.scanNotifier?.publishScanStatusChanged({
      tenantId: scanning.tenantId,
      scanId: scanning.scanId,
      accountId: scanning.accountId,
      status: scanning.status,
      findingCount: scanning.findingCount,
      estimatedMonthlySavingsUsd: scanning.estimatedMonthlySavingsUsd,
    });

    const inventory = await this.deps.awsInventory.fetchInventory({
      tenantId: message.tenantId,
      accountId: message.accountId,
      roleArn: message.roleArn,
      externalId: message.externalId,
      regions: message.regions,
    });

    const analyzing = scanning.withStatus('analyzing');
    await this.deps.scanWriter.save(analyzing);

    const analyzerMessage = {
      tenantId: message.tenantId,
      scanId: message.scanId,
      accountId: message.accountId,
      correlationId: message.correlationId,
      inventoryPayload: inventory,
    };

    await Promise.all([
      this.deps.rightsizingQueue.enqueue(analyzerMessage),
      this.deps.modernizationQueue.enqueue(analyzerMessage),
      this.deps.orphanedQueue.enqueue(analyzerMessage),
    ]);

    this.deps.logger?.info('Inventario procesado — fan-out analyzers', {
      scanId: message.scanId,
      ec2Count: inventory.ec2Instances.length,
      ebsCount: inventory.ebsVolumes.length,
      eipCount: inventory.elasticIps.length,
    });
  }
}
