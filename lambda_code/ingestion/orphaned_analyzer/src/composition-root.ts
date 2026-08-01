import { DetectOrphanedResourcesUseCase } from '@track-aws/application';
import {
  AppSyncFindingEventPublisherAdapter,
  ConsoleLogger,
  DynamoDbFindingRepository,
  UuidGenerator,
} from '@track-aws/infrastructure';

let cachedUseCase: DetectOrphanedResourcesUseCase | undefined;

export function buildDetectOrphanedResourcesUseCase(): DetectOrphanedResourcesUseCase {
  if (cachedUseCase) return cachedUseCase;

  cachedUseCase = new DetectOrphanedResourcesUseCase({
    findingWriter: new DynamoDbFindingRepository(),
    findingNotifier: new AppSyncFindingEventPublisherAdapter(),
    idGenerator: new UuidGenerator(),
    logger: new ConsoleLogger({ source: 'orphaned_analyzer' }),
  });

  return cachedUseCase;
}
