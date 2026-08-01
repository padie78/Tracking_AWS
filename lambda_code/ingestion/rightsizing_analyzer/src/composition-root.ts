import { DetectOversizedEc2UseCase } from '@track-aws/application';
import {
  AppSyncFindingEventPublisherAdapter,
  ConsoleLogger,
  DynamoDbFindingRepository,
  UuidGenerator,
} from '@track-aws/infrastructure';

let cachedUseCase: DetectOversizedEc2UseCase | undefined;

export function buildDetectOversizedEc2UseCase(): DetectOversizedEc2UseCase {
  if (cachedUseCase) return cachedUseCase;

  cachedUseCase = new DetectOversizedEc2UseCase({
    findingWriter: new DynamoDbFindingRepository(),
    findingNotifier: new AppSyncFindingEventPublisherAdapter(),
    idGenerator: new UuidGenerator(),
    logger: new ConsoleLogger({ source: 'rightsizing_analyzer' }),
  });

  return cachedUseCase;
}
