import type {
  IFindingEventNotifier,
  IScanEventNotifier,
  IDossierEventNotifier,
  IAuditEventNotifier,
} from '@track-aws/application';

const MUTATION_PUBLISH_SCAN_STATUS = /* GraphQL */ `
  mutation PublishScanStatusChanged($input: ScanStatusChangedInput!) {
    publishScanStatusChanged(input: $input) {
      tenantId
      scanId
      accountId
      status
      findingCount
      estimatedMonthlySavingsUsd
    }
  }
`;

const MUTATION_PUBLISH_FINDING_READY = /* GraphQL */ `
  mutation PublishFindingReady($input: FindingReadyInput!) {
    publishFindingReady(input: $input) {
      tenantId
      scanId
      findingId
      category
      estimatedMonthlySavingsUsd
      title
    }
  }
`;

const MUTATION_PUBLISH_DOSSIER_READY = /* GraphQL */ `
  mutation PublishDossierReady($input: DossierReadyInput!) {
    publishDossierReady(input: $input) {
      tenantId
      dossierId
      scanId
      title
      totalEstimatedMonthlySavingsUsd
    }
  }
`;

const MUTATION_PUBLISH_AUDIT_STATUS = /* GraphQL */ `
  mutation PublishAuditStatusChanged($input: AuditStatusChangedInput!) {
    publishAuditStatusChanged(input: $input) {
      tenantId
      auditId
      accountId
      status
      findingCount
      criticalCount
      highCount
      globalScore
      estimatedMonthlySavingsUsd
    }
  }
`;

export interface AppSyncPublisherConfig {
  appsyncEndpoint?: string;
  apiKey?: string;
}

function resolveEndpoint(raw: string | undefined): string {
  const endpoint = (raw ?? '').trim();
  if (!endpoint || endpoint.toLowerCase().includes('placeholder')) {
    return '';
  }
  return endpoint;
}

async function publishMutation(
  endpoint: string,
  apiKey: string,
  query: string,
  input: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      variables: { input },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `AppSync publish falló (${res.status}): ${body.slice(0, 500)} ${JSON.stringify(context)}`,
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { errors?: Array<{ message?: string }> }
    | null;

  if (json?.errors?.length) {
    throw new Error(
      `AppSync publish con errors[]: ${json.errors
        .map((e) => e.message)
        .filter(Boolean)
        .join('; ')}`,
    );
  }
}

export class AppSyncScanEventPublisherAdapter implements IScanEventNotifier {
  private readonly endpoint: string;
  private readonly apiKey?: string;

  constructor(config: AppSyncPublisherConfig = {}) {
    this.endpoint = resolveEndpoint(
      config.appsyncEndpoint ?? process.env['APPSYNC_ENDPOINT'],
    );
    this.apiKey = config.apiKey ?? process.env['APPSYNC_API_KEY'];
  }

  async publishScanStatusChanged(input: {
    tenantId: string;
    scanId: string;
    accountId: string;
    status: string;
    findingCount: number;
    estimatedMonthlySavingsUsd: number;
  }): Promise<void> {
    if (!this.endpoint || !this.apiKey) {
      console.warn(
        JSON.stringify({
          level: 'WARN',
          message:
            'AppSync publish omitido: APPSYNC_ENDPOINT / APPSYNC_API_KEY no configurados.',
          ...input,
        }),
      );
      return;
    }

    await publishMutation(
      this.endpoint,
      this.apiKey,
      MUTATION_PUBLISH_SCAN_STATUS,
      input,
      { scanId: input.scanId },
    );
  }
}

export class AppSyncFindingEventPublisherAdapter implements IFindingEventNotifier {
  private readonly endpoint: string;
  private readonly apiKey?: string;

  constructor(config: AppSyncPublisherConfig = {}) {
    this.endpoint = resolveEndpoint(
      config.appsyncEndpoint ?? process.env['APPSYNC_ENDPOINT'],
    );
    this.apiKey = config.apiKey ?? process.env['APPSYNC_API_KEY'];
  }

  async publishFindingReady(input: {
    tenantId: string;
    scanId: string;
    findingId: string;
    category: string;
    estimatedMonthlySavingsUsd: number;
    title: string;
  }): Promise<void> {
    if (!this.endpoint || !this.apiKey) {
      console.warn(
        JSON.stringify({
          level: 'WARN',
          message:
            'AppSync publish omitido: APPSYNC_ENDPOINT / APPSYNC_API_KEY no configurados.',
          ...input,
        }),
      );
      return;
    }

    await publishMutation(
      this.endpoint,
      this.apiKey,
      MUTATION_PUBLISH_FINDING_READY,
      input,
      { findingId: input.findingId },
    );
  }
}

export class AppSyncDossierEventPublisherAdapter implements IDossierEventNotifier {
  private readonly endpoint: string;
  private readonly apiKey?: string;

  constructor(config: AppSyncPublisherConfig = {}) {
    this.endpoint = resolveEndpoint(
      config.appsyncEndpoint ?? process.env['APPSYNC_ENDPOINT'],
    );
    this.apiKey = config.apiKey ?? process.env['APPSYNC_API_KEY'];
  }

  async publishDossierReady(input: {
    tenantId: string;
    dossierId: string;
    scanId: string;
    title: string;
    totalEstimatedMonthlySavingsUsd: number;
  }): Promise<void> {
    if (!this.endpoint || !this.apiKey) {
      console.warn(
        JSON.stringify({
          level: 'WARN',
          message:
            'AppSync publish omitido: APPSYNC_ENDPOINT / APPSYNC_API_KEY no configurados.',
          ...input,
        }),
      );
      return;
    }

    await publishMutation(
      this.endpoint,
      this.apiKey,
      MUTATION_PUBLISH_DOSSIER_READY,
      input,
      { dossierId: input.dossierId },
    );
  }
}

export class AppSyncAuditEventPublisherAdapter implements IAuditEventNotifier {
  private readonly endpoint: string;
  private readonly apiKey?: string;

  constructor(config: AppSyncPublisherConfig = {}) {
    this.endpoint = resolveEndpoint(
      config.appsyncEndpoint ?? process.env['APPSYNC_ENDPOINT'],
    );
    this.apiKey = config.apiKey ?? process.env['APPSYNC_API_KEY'];
  }

  async publishAuditStatusChanged(input: {
    tenantId: string;
    auditId: string;
    accountId: string;
    status: string;
    findingCount: number;
    criticalCount: number;
    highCount: number;
    globalScore: number;
    estimatedMonthlySavingsUsd: number;
  }): Promise<void> {
    if (!this.endpoint || !this.apiKey) {
      console.warn(
        JSON.stringify({
          level: 'WARN',
          message:
            'AppSync publish omitido: APPSYNC_ENDPOINT / APPSYNC_API_KEY no configurados.',
          ...input,
        }),
      );
      return;
    }

    await publishMutation(
      this.endpoint,
      this.apiKey,
      MUTATION_PUBLISH_AUDIT_STATUS,
      input,
      { auditId: input.auditId },
    );
  }
}
