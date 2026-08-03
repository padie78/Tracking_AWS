import { Injectable } from '@angular/core';
import { generateClient } from 'aws-amplify/api';
import { authenticatedAppsyncOptions } from '../core/auth/appsync-auth.util';

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
  friendlyHeadline?: string | null;
  friendlyWhy?: string | null;
  friendlyAction?: string | null;
  friendlyArea?: string | null;
  createdAtIso: string;
}

export interface AuditReportView {
  tenantId: string;
  auditId: string;
  reportId: string;
  accountId: string;
  markdownBody: string;
  aiGenerated: boolean;
  inventorySummary: {
    totalCount: number;
    ec2Count: number;
    ebsCount: number;
    eipCount: number;
    runningEc2Count: number;
    stoppedEc2Count: number;
    unattachedEbsCount: number;
    idleEipCount: number;
  } | null;
  s3Key: string;
  createdAtIso: string;
  globalScore: number;
  estimatedMonthlySavingsUsd: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
}

export interface InventorySummaryView {
  totalCount: number;
  ec2Count: number;
  ebsCount: number;
  eipCount: number;
  runningEc2Count: number;
  stoppedEc2Count: number;
  unattachedEbsCount: number;
  idleEipCount: number;
}

export interface InventoryResourceView {
  resourceType: string;
  resourceId: string;
  resourceArn: string;
  region: string;
  state: string;
  detail: string;
  estimatedMonthlyCostUsd: number;
}

export interface AccountInventoryView {
  accountId: string;
  capturedAtIso: string;
  source: string;
  auditId: string | null;
  summary: InventorySummaryView;
  resources: InventoryResourceView[];
}

export interface TopologySnapshotView {
  tenantId: string;
  accountId: string;
  auditId: string;
  asOfIso: string;
  capturedAtIso: string;
  source: string;
  summary: {
    nodeCount: number;
    edgeCount: number;
    serverlessCount: number;
    nonServerlessCount: number;
    criticalNodeCount: number;
  };
  nodes: Array<{
    id: string;
    label: string;
    resourceType: string;
    computeClass: string;
    region: string;
    state: string;
    health: string;
    estimatedMonthlyCostUsd: number;
    meta?: { findingIds?: string[] | null } | null;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    kind: string;
    label?: string | null;
    bidirectional?: boolean | null;
  }>;
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
      friendlyHeadline
      friendlyWhy
      friendlyAction
      friendlyArea
      createdAtIso
    }
  }
`;

const GET_AUDIT_REPORT = /* GraphQL */ `
  query GetAuditReport($auditId: ID!) {
    getAuditReport(auditId: $auditId) {
      tenantId
      auditId
      reportId
      accountId
      markdownBody
      aiGenerated
      inventorySummary {
        totalCount
        ec2Count
        ebsCount
        eipCount
        runningEc2Count
        stoppedEc2Count
        unattachedEbsCount
        idleEipCount
      }
      s3Key
      createdAtIso
      globalScore
      estimatedMonthlySavingsUsd
      findingCount
      criticalCount
      highCount
    }
  }
`;

const INVENTORY_FIELDS = /* GraphQL */ `
  accountId
  capturedAtIso
  source
  auditId
  summary {
    totalCount
    ec2Count
    ebsCount
    eipCount
    runningEc2Count
    stoppedEc2Count
    unattachedEbsCount
    idleEipCount
  }
  resources {
    resourceType
    resourceId
    resourceArn
    region
    state
    detail
    estimatedMonthlyCostUsd
  }
`;

const GET_ACCOUNT_INVENTORY = /* GraphQL */ `
  query GetAccountInventory($accountId: String!) {
    getAccountInventory(accountId: $accountId) {
      ${INVENTORY_FIELDS}
    }
  }
`;

const LIST_AUDIT_INVENTORY = /* GraphQL */ `
  query ListAuditInventory($auditId: ID!) {
    listAuditInventory(auditId: $auditId) {
      ${INVENTORY_FIELDS}
    }
  }
`;

const GET_TOPOLOGY_SNAPSHOT = /* GraphQL */ `
  query GetTopologySnapshot($accountId: String!, $auditId: ID) {
    getTopologySnapshot(accountId: $accountId, auditId: $auditId) {
      tenantId
      accountId
      auditId
      asOfIso
      capturedAtIso
      source
      summary {
        nodeCount
        edgeCount
        serverlessCount
        nonServerlessCount
        criticalNodeCount
      }
      nodes {
        id
        label
        resourceType
        computeClass
        region
        state
        health
        estimatedMonthlyCostUsd
        meta {
          findingIds
        }
      }
      edges {
        id
        source
        target
        kind
        label
        bidirectional
      }
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

  async getAuditReport(auditId: string): Promise<AuditReportView | null> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: GET_AUDIT_REPORT,
      variables: { auditId },
      ...authOptions,
    })) as { data?: { getAuditReport?: AuditReportView | null } };
    return result.data?.getAuditReport ?? null;
  }

  async getAccountInventory(accountId: string): Promise<AccountInventoryView> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: GET_ACCOUNT_INVENTORY,
      variables: { accountId },
      ...authOptions,
    })) as { data?: { getAccountInventory?: AccountInventoryView } };
    const inv = result.data?.getAccountInventory;
    if (!inv) throw new Error('getAccountInventory no devolvió resultado.');
    return inv;
  }

  async listAuditInventory(
    auditId: string,
  ): Promise<AccountInventoryView | null> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: LIST_AUDIT_INVENTORY,
      variables: { auditId },
      ...authOptions,
    })) as { data?: { listAuditInventory?: AccountInventoryView | null } };
    return result.data?.listAuditInventory ?? null;
  }

  async getTopologySnapshot(input: {
    accountId: string;
    auditId?: string;
  }): Promise<TopologySnapshotView | null> {
    const authOptions = await authenticatedAppsyncOptions();
    const result = (await this.client.graphql({
      query: GET_TOPOLOGY_SNAPSHOT,
      variables: {
        accountId: input.accountId,
        auditId: input.auditId ?? null,
      },
      ...authOptions,
    })) as { data?: { getTopologySnapshot?: TopologySnapshotView | null } };
    return result.data?.getTopologySnapshot ?? null;
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
