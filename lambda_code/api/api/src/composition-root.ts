import {
  GetAccountInventoryUseCase,
  GetAuditUseCase,
  GetAuditReportUseCase,
  GetTopologySnapshotUseCase,
  LinkAwsAccountUseCase,
  ListAlertChannelsUseCase,
  ListAuditFindingsUseCase,
  ListAuditInventoryUseCase,
  ListAwsAccountsUseCase,
  StartAuditUseCase,
  SimulateMockScanUseCase,
  UpsertAlertChannelUseCase,
  DeleteAlertChannelUseCase,
  VerifyAwsAccountLinkUseCase,
} from '@track-aws/application';
import {
  AppSyncAuditEventPublisherAdapter,
  AssumeRoleAwsInventoryAdapter,
  AuditReportGenerator,
  buildTopologySnapshot,
  ConsoleLogger,
  DynamoDbAlertChannelRepository,
  DynamoDbAuditFindingRepository,
  DynamoDbAuditInventoryRepository,
  DynamoDbAuditJobRepository,
  DynamoDbAwsAccountLinkRepository,
  DynamoDbTopologySnapshotRepository,
  MockScanPipelineAdapter,
  StepFunctionsAuditOrchestratorAdapter,
  UuidGenerator,
} from '@track-aws/infrastructure';

const logger = new ConsoleLogger({ source: 'appsync_api' });
const idGenerator = new UuidGenerator();
const accountLinkRepository = new DynamoDbAwsAccountLinkRepository();
const auditJobRepository = new DynamoDbAuditJobRepository();
const auditFindingRepository = new DynamoDbAuditFindingRepository();
const alertChannelRepository = new DynamoDbAlertChannelRepository();
const awsInventory = new AssumeRoleAwsInventoryAdapter();
const topologyRepository = new DynamoDbTopologySnapshotRepository();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const startAudit = new StartAuditUseCase({
  accountLinks: accountLinkRepository,
  auditWriter: auditJobRepository,
  orchestrator: new StepFunctionsAuditOrchestratorAdapter(),
  idGenerator,
  auditNotifier: new AppSyncAuditEventPublisherAdapter(),
  logger,
});

export const simulateMockScan = new SimulateMockScanUseCase({
  accountLinks: accountLinkRepository,
  auditWriter: auditJobRepository,
  pipeline: new MockScanPipelineAdapter(),
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

const auditInventoryRepository = new DynamoDbAuditInventoryRepository();

export const getAccountInventory = new GetAccountInventoryUseCase(
  accountLinkRepository,
  awsInventory,
);

export const listAuditInventory = new ListAuditInventoryUseCase(
  auditInventoryRepository,
  new AuditReportGenerator(),
);

export const getTopologySnapshot = new GetTopologySnapshotUseCase({
  audits: auditJobRepository,
  inventory: auditInventoryRepository,
  findings: auditFindingRepository,
  topology: topologyRepository,
  build: buildTopologySnapshot,
});

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
