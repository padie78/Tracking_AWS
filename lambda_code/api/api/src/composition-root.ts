import {
  EnqueueInventoryScanUseCase,
  GenerateSavingsDossierUseCase,
  GetAuditUseCase,
  GetAuditReportUseCase,
  GetSavingsDossierUseCase,
  LinkAwsAccountUseCase,
  ListAlertChannelsUseCase,
  ListAuditFindingsUseCase,
  ListAwsAccountsUseCase,
  ListFindingsByScanUseCase,
  StartAuditUseCase,
  UpsertAlertChannelUseCase,
  DeleteAlertChannelUseCase,
  VerifyAwsAccountLinkUseCase,
} from '@track-aws/application';
import {
  AppSyncAuditEventPublisherAdapter,
  AppSyncDossierEventPublisherAdapter,
  AssumeRoleAwsInventoryAdapter,
  AuditReportGenerator,
  BedrockDossierGeneratorAdapter,
  ConsoleLogger,
  DynamoDbAlertChannelRepository,
  DynamoDbAuditFindingRepository,
  DynamoDbAuditJobRepository,
  DynamoDbAwsAccountLinkRepository,
  DynamoDbDossierRepository,
  DynamoDbFindingRepository,
  DynamoDbScanJobRepository,
  SqsScanQueuePublisherAdapter,
  StepFunctionsAuditOrchestratorAdapter,
  UuidGenerator,
} from '@track-aws/infrastructure';

const logger = new ConsoleLogger({ source: 'appsync_api' });
const idGenerator = new UuidGenerator();
const scanRepository = new DynamoDbScanJobRepository();
const findingRepository = new DynamoDbFindingRepository();
const dossierRepository = new DynamoDbDossierRepository();
const accountLinkRepository = new DynamoDbAwsAccountLinkRepository();
const auditJobRepository = new DynamoDbAuditJobRepository();
const auditFindingRepository = new DynamoDbAuditFindingRepository();
const alertChannelRepository = new DynamoDbAlertChannelRepository();
const awsInventory = new AssumeRoleAwsInventoryAdapter();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const enqueueInventoryScan = new EnqueueInventoryScanUseCase({
  scanWriter: scanRepository,
  scanQueue: new SqsScanQueuePublisherAdapter(),
  accountLinks: accountLinkRepository,
  idGenerator,
  logger,
});

export const startAudit = new StartAuditUseCase({
  accountLinks: accountLinkRepository,
  auditWriter: auditJobRepository,
  orchestrator: new StepFunctionsAuditOrchestratorAdapter(),
  idGenerator,
  auditNotifier: new AppSyncAuditEventPublisherAdapter(),
  logger,
});

export const getAudits = new GetAuditUseCase(auditJobRepository);

export const listAuditFindings = new ListAuditFindingsUseCase(
  auditFindingRepository,
);

export const getAuditReport = new GetAuditReportUseCase(
  new AuditReportGenerator(),
);

export const linkAwsAccount = new LinkAwsAccountUseCase({
  accountLinks: accountLinkRepository,
  idGenerator,
  scannerAccountId: requireEnv('SCANNER_ACCOUNT_ID'),
  scannerRoleArn: requireEnv('SCANNER_ROLE_ARN'),
  connectTemplateUrl: requireEnv('CONNECT_TEMPLATE_URL'),
  logger,
});

export const verifyAwsAccountLink = new VerifyAwsAccountLinkUseCase({
  accountLinks: accountLinkRepository,
  inventory: awsInventory,
  logger,
});

export const listAwsAccounts = new ListAwsAccountsUseCase(accountLinkRepository);

export const listFindingsByScan = new ListFindingsByScanUseCase(findingRepository);

export const getSavingsDossier = new GetSavingsDossierUseCase(dossierRepository);

export const generateSavingsDossier = new GenerateSavingsDossierUseCase({
  findingReader: findingRepository,
  dossierAi: new BedrockDossierGeneratorAdapter(),
  dossierWriter: dossierRepository,
  dossierNotifier: new AppSyncDossierEventPublisherAdapter(),
  idGenerator,
  logger,
});

export const upsertAlertChannel = new UpsertAlertChannelUseCase({
  channels: alertChannelRepository,
  idGenerator,
  logger,
});

export const listAlertChannels = new ListAlertChannelsUseCase(
  alertChannelRepository,
);

export const deleteAlertChannel = new DeleteAlertChannelUseCase({
  channels: alertChannelRepository,
  logger,
});
