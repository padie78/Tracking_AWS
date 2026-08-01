import { EnqueueInventoryScanUseCase } from '@track-aws/application';
import {
  ConsoleLogger,
  DynamoDbAwsAccountLinkRepository,
  DynamoDbScanJobRepository,
  SqsScanQueuePublisherAdapter,
  UuidGenerator,
} from '@track-aws/infrastructure';

let cachedUseCase: EnqueueInventoryScanUseCase | undefined;

export function buildEnqueueInventoryScanUseCase(): EnqueueInventoryScanUseCase {
  if (cachedUseCase) return cachedUseCase;

  const scanRepository = new DynamoDbScanJobRepository();

  cachedUseCase = new EnqueueInventoryScanUseCase({
    scanWriter: scanRepository,
    scanQueue: new SqsScanQueuePublisherAdapter(),
    accountLinks: new DynamoDbAwsAccountLinkRepository(),
    idGenerator: new UuidGenerator(),
    logger: new ConsoleLogger({ source: 'scan_ingestion' }),
  });

  return cachedUseCase;
}
