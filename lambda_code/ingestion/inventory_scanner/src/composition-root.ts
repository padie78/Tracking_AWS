import { ProcessInventoryScanUseCase } from '@track-aws/application';
import {
  AppSyncScanEventPublisherAdapter,
  AssumeRoleAwsInventoryAdapter,
  ConsoleLogger,
  DynamoDbScanJobRepository,
  SqsModernizationQueuePublisherAdapter,
  SqsOrphanedQueuePublisherAdapter,
  SqsRightsizingQueuePublisherAdapter,
} from '@track-aws/infrastructure';

let cachedUseCase: ProcessInventoryScanUseCase | undefined;

export function buildProcessInventoryScanUseCase(): ProcessInventoryScanUseCase {
  if (cachedUseCase) return cachedUseCase;

  const scanRepository = new DynamoDbScanJobRepository();

  cachedUseCase = new ProcessInventoryScanUseCase({
    awsInventory: new AssumeRoleAwsInventoryAdapter(),
    scanReader: scanRepository,
    scanWriter: scanRepository,
    scanNotifier: new AppSyncScanEventPublisherAdapter(),
    rightsizingQueue: new SqsRightsizingQueuePublisherAdapter(),
    modernizationQueue: new SqsModernizationQueuePublisherAdapter(),
    orphanedQueue: new SqsOrphanedQueuePublisherAdapter(),
    logger: new ConsoleLogger({ source: 'inventory_scanner' }),
  });

  return cachedUseCase;
}
