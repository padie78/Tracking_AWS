import { GenerateSavingsDossierUseCase } from '@track-aws/application';
import {
  AppSyncDossierEventPublisherAdapter,
  BedrockDossierGeneratorAdapter,
  ConsoleLogger,
  DynamoDbDossierRepository,
  DynamoDbFindingRepository,
  UuidGenerator,
} from '@track-aws/infrastructure';

let cachedUseCase: GenerateSavingsDossierUseCase | undefined;

export function buildGenerateSavingsDossierUseCase(): GenerateSavingsDossierUseCase {
  if (cachedUseCase) return cachedUseCase;

  cachedUseCase = new GenerateSavingsDossierUseCase({
    findingReader: new DynamoDbFindingRepository(),
    dossierAi: new BedrockDossierGeneratorAdapter(),
    dossierWriter: new DynamoDbDossierRepository(),
    dossierNotifier: new AppSyncDossierEventPublisherAdapter(),
    idGenerator: new UuidGenerator(),
    logger: new ConsoleLogger({ source: 'dossier_generator' }),
  });

  return cachedUseCase;
}
