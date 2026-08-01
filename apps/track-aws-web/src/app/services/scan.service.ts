import { Injectable } from '@angular/core';
import { generateClient } from 'aws-amplify/api';
import { authenticatedAppsyncOptions } from '../core/auth/appsync-auth.util';

export interface FindingView {
  tenantId: string;
  scanId: string;
  findingId: string;
  category: string;
  resourceArn: string;
  resourceId: string;
  region: string;
  title: string;
  rationale: string;
  severity: string;
  estimatedMonthlySavingsUsd: number;
  recommendedAction: string;
  createdAtIso: string;
}

export interface RemediationStepView {
  order: number;
  title: string;
  instruction: string;
  estimatedMinutes: number | null;
}

export interface SavingsDossierView {
  tenantId: string;
  dossierId: string;
  scanId: string;
  accountId: string;
  title: string;
  markdownBody: string;
  totalEstimatedMonthlySavingsUsd: number;
  findingIds: string[];
  remediationSteps: RemediationStepView[];
  createdAtIso: string;
}

export interface StartScanResultView {
  accepted: boolean;
  scanId: string;
  correlationId: string;
  tenantId: string;
  accountId: string;
}

export interface StartAuditResultView {
  accepted: boolean;
  auditId: string;
  correlationId: string;
  executionArn: string;
  tenantId: string;
  accountId: string;
}

export interface AlertChannelView {
  channelId: string;
  kind: string;
  target: string;
  label: string;
  categories: string[];
  enabled: boolean;
  createdAtIso?: string | null;
}

export interface WafPillarScoresView {
  operationalExcellence: number;
  security: number;
  reliability: number;
  performanceEfficiency: number;
  costOptimization: number;
  sustainability: number;
}

export interface AuditJobView {
  tenantId: string;
  auditId: string;
  accountId: string;
  status: string;
  correlationId: string;
  createdAtIso: string;
  completedAtIso: string | null;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  estimatedMonthlySavingsUsd: number;
  globalScore: number;
  pillarScores: WafPillarScoresView;
  executionArn: string | null;
  errorMessage: string | null;
}

export interface AuditFindingView {
  tenantId: string;
  auditId: string;
  findingId: string;
  domain: string;
  category: string;
  severity: string;
  resourceArn: string;
  resourceId: string;
  region: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  estimatedMonthlySavingsUsd: number;
  checkId: string | null;
  createdAtIso: string;
}

export interface AwsAccountLinkView {
  accountId: string;
  displayName: string;
  roleArn: string;
  externalId: string;
  regions: string[];
  status: string;
  linkedAtIso: string;
  verifiedAtIso: string | null;
}

export interface LinkAwsAccountResultView {
  accountId: string;
  displayName: string;
  roleArn: string;
  externalId: string;
  roleName: string;
  regions: string[];
  status: string;
  cloudFormationUrl: string;
  scannerAccountId: string;
  scannerRoleArn: string;
}

export interface VerifyAwsAccountLinkResultView {
  accountId: string;
  status: string;
  verifiedAtIso: string;
}

const FINDING_FIELDS = /* GraphQL */ `
  tenantId
  scanId
  findingId
  category
  resourceArn
  resourceId
  region
  title
  rationale
  severity
  estimatedMonthlySavingsUsd
  recommendedAction
  createdAtIso
`;

const DOSSIER_FIELDS = /* GraphQL */ `
  tenantId
  dossierId
  scanId
  accountId
  title
  markdownBody
  totalEstimatedMonthlySavingsUsd
  findingIds
  remediationSteps {
    order
    title
    instruction
    estimatedMinutes
  }
  createdAtIso
`;

const ACCOUNT_FIELDS = /* GraphQL */ `
  accountId
  displayName
  roleArn
  externalId
  regions
  status
  linkedAtIso
  verifiedAtIso
`;

const AUDIT_FIELDS = /* GraphQL */ `
  tenantId
  auditId
  accountId
  status
  correlationId
  createdAtIso
  completedAtIso
  findingCount
  criticalCount
  highCount
  estimatedMonthlySavingsUsd
  globalScore
  pillarScores {
    operationalExcellence
    security
    reliability
    performanceEfficiency
    costOptimization
    sustainability
  }
  executionArn
  errorMessage
`;

const START_AUDIT = /* GraphQL */ `
  mutation StartAudit($input: StartAuditInput!) {
    startAudit(input: $input) {
      accepted
      auditId
      correlationId
      executionArn
      tenantId
      accountId
    }
  }
`;

const START_SCAN = /* GraphQL */ `
  mutation StartScan($input: StartScanInput!) {
    startScan(input: $input) {
      accepted
      scanId
      correlationId
      tenantId
      accountId
    }
  }
`;

const LINK_AWS_ACCOUNT = /* GraphQL */ `
  mutation LinkAwsAccount($input: LinkAwsAccountInput!) {
    linkAwsAccount(input: $input) {
      accountId
      displayName
      roleArn
      externalId
      roleName
      regions
      status
      cloudFormationUrl
      scannerAccountId
      scannerRoleArn
    }
  }
`;

const VERIFY_AWS_ACCOUNT = /* GraphQL */ `
  mutation VerifyAwsAccountLink($input: VerifyAwsAccountLinkInput!) {
    verifyAwsAccountLink(input: $input) {
      accountId
      status
      verifiedAtIso
    }
  }
`;

const LIST_AWS_ACCOUNTS = /* GraphQL */ `
  query ListAwsAccounts {
    listAwsAccounts {
      ${ACCOUNT_FIELDS}
    }
  }
`;

const LIST_AUDITS = /* GraphQL */ `
  query ListAudits($auditId: ID, $limit: Int) {
    listAudits(auditId: $auditId, limit: $limit) {
      ${AUDIT_FIELDS}
    }
  }
`;

const LIST_AUDIT_FINDINGS = /* GraphQL */ `
  query ListAuditFindings($auditId: ID!, $domain: String) {
    listAuditFindings(auditId: $auditId, domain: $domain) {
      tenantId
      auditId
      findingId
      domain
      category
      severity
      resourceArn
      resourceId
      region
      title
      rationale
      recommendedAction
      estimatedMonthlySavingsUsd
      checkId
      createdAtIso
    }
  }
`;

const LIST_FINDINGS_BY_SCAN = /* GraphQL */ `
  query ListFindingsByScan($scanId: ID!) {
    listFindingsByScan(scanId: $scanId) {
      ${FINDING_FIELDS}
    }
  }
`;

const GET_SAVINGS_DOSSIER = /* GraphQL */ `
  query GetSavingsDossier($dossierId: ID, $scanId: ID) {
    getSavingsDossier(dossierId: $dossierId, scanId: $scanId) {
      ${DOSSIER_FIELDS}
    }
  }
`;

const GENERATE_SAVINGS_DOSSIER = /* GraphQL */ `
  mutation GenerateSavingsDossier($input: GenerateSavingsDossierInput!) {
    generateSavingsDossier(input: $input) {
      ${DOSSIER_FIELDS}
    }
  }
`;

const LIST_ALERT_CHANNELS = /* GraphQL */ `
  query ListAlertChannels {
    listAlertChannels {
      channelId
      kind
      target
      label
      categories
      enabled
      createdAtIso
    }
  }
`;

const UPSERT_ALERT_CHANNEL = /* GraphQL */ `
  mutation UpsertAlertChannel($input: UpsertAlertChannelInput!) {
    upsertAlertChannel(input: $input) {
      channelId
      kind
      target
      label
      categories
      enabled
      createdAtIso
    }
  }
`;

const DELETE_ALERT_CHANNEL = /* GraphQL */ `
  mutation DeleteAlertChannel($channelId: ID!) {
    deleteAlertChannel(channelId: $channelId)
  }
`;

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly client = generateClient();

  async startAudit(input: {
    accountId: string;
    regions?: string[];
  }): Promise<StartAuditResultView> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: START_AUDIT,
      variables: { input },
      ...authOptions,
    })) as { data?: { startAudit?: StartAuditResultView } };

    const audit = result.data?.startAudit;
    if (!audit) throw new Error('startAudit no devolvió resultado.');
    return audit;
  }

  async listAudits(input?: {
    auditId?: string;
    limit?: number;
  }): Promise<AuditJobView[]> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: LIST_AUDITS,
      variables: {
        auditId: input?.auditId ?? null,
        limit: input?.limit ?? null,
      },
      ...authOptions,
    })) as { data?: { listAudits?: AuditJobView[] } };
    return result.data?.listAudits ?? [];
  }

  async listAuditFindings(
    auditId: string,
    domain?: string,
  ): Promise<AuditFindingView[]> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: LIST_AUDIT_FINDINGS,
      variables: { auditId, domain: domain ?? null },
      ...authOptions,
    })) as { data?: { listAuditFindings?: AuditFindingView[] } };
    return result.data?.listAuditFindings ?? [];
  }

  async startScan(input: {
    accountId: string;
    regions?: string[];
  }): Promise<StartScanResultView> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: START_SCAN,
      variables: { input },
      ...authOptions,
    })) as { data?: { startScan?: StartScanResultView } };

    const scan = result.data?.startScan;
    if (!scan) throw new Error('startScan no devolvió resultado.');
    return scan;
  }

  async linkAwsAccount(input: {
    accountId: string;
    displayName?: string;
    roleName?: string;
    regions?: string[];
  }): Promise<LinkAwsAccountResultView> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: LINK_AWS_ACCOUNT,
      variables: { input },
      ...authOptions,
    })) as { data?: { linkAwsAccount?: LinkAwsAccountResultView } };

    const link = result.data?.linkAwsAccount;
    if (!link) throw new Error('linkAwsAccount no devolvió resultado.');
    return link;
  }

  async verifyAwsAccountLink(input: {
    accountId: string;
  }): Promise<VerifyAwsAccountLinkResultView> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: VERIFY_AWS_ACCOUNT,
      variables: { input },
      ...authOptions,
    })) as { data?: { verifyAwsAccountLink?: VerifyAwsAccountLinkResultView } };

    const verified = result.data?.verifyAwsAccountLink;
    if (!verified) throw new Error('verifyAwsAccountLink no devolvió resultado.');
    return verified;
  }

  async listAwsAccounts(): Promise<AwsAccountLinkView[]> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: LIST_AWS_ACCOUNTS,
      ...authOptions,
    })) as { data?: { listAwsAccounts?: AwsAccountLinkView[] } };

    return result.data?.listAwsAccounts ?? [];
  }

  async listFindingsByScan(scanId: string): Promise<FindingView[]> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: LIST_FINDINGS_BY_SCAN,
      variables: { scanId },
      ...authOptions,
    })) as { data?: { listFindingsByScan?: FindingView[] } };

    return result.data?.listFindingsByScan ?? [];
  }

  async getSavingsDossier(input: {
    dossierId?: string;
    scanId?: string;
  }): Promise<SavingsDossierView | null> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: GET_SAVINGS_DOSSIER,
      variables: {
        dossierId: input.dossierId ?? null,
        scanId: input.scanId ?? null,
      },
      ...authOptions,
    })) as { data?: { getSavingsDossier?: SavingsDossierView | null } };

    return result.data?.getSavingsDossier ?? null;
  }

  async generateSavingsDossier(input: {
    scanId: string;
    accountId: string;
    roleTone?: string;
  }): Promise<SavingsDossierView | null> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: GENERATE_SAVINGS_DOSSIER,
      variables: { input },
      ...authOptions,
    })) as { data?: { generateSavingsDossier?: SavingsDossierView | null } };

    return result.data?.generateSavingsDossier ?? null;
  }

  async listAlertChannels(): Promise<AlertChannelView[]> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: LIST_ALERT_CHANNELS,
      ...authOptions,
    })) as { data?: { listAlertChannels?: AlertChannelView[] } };
    return result.data?.listAlertChannels ?? [];
  }

  async upsertAlertChannel(input: {
    channelId?: string;
    kind: 'webhook' | 'slack' | 'email';
    target: string;
    label?: string;
    categories?: string[];
  }): Promise<AlertChannelView> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: UPSERT_ALERT_CHANNEL,
      variables: { input },
      ...authOptions,
    })) as { data?: { upsertAlertChannel?: AlertChannelView } };
    const row = result.data?.upsertAlertChannel;
    if (!row) throw new Error('upsertAlertChannel sin respuesta');
    return row;
  }

  async deleteAlertChannel(channelId: string): Promise<boolean> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: DELETE_ALERT_CHANNEL,
      variables: { channelId },
      ...authOptions,
    })) as { data?: { deleteAlertChannel?: boolean } };
    return result.data?.deleteAlertChannel === true;
  }
}
