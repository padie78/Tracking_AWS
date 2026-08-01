import { RecommendInstanceModernizationUseCase } from '@track-aws/application';
import {
  AppSyncFindingEventPublisherAdapter,
  ConsoleLogger,
  DynamoDbFindingRepository,
  UuidGenerator,
} from '@track-aws/infrastructure';

let cachedUseCase: RecommendInstanceModernizationUseCase | undefined;

export function buildRecommendInstanceModernizationUseCase(): RecommendInstanceModernizationUseCase {
  if (cachedUseCase) return cachedUseCase;

  cachedUseCase = new RecommendInstanceModernizationUseCase({
    findingWriter: new DynamoDbFindingRepository(),
    findingNotifier: new AppSyncFindingEventPublisherAdapter(),
    idGenerator: new UuidGenerator(),
    logger: new ConsoleLogger({ source: 'modernization_analyzer' }),
  });

  return cachedUseCase;
}
