import type { IAuditEventNotifier } from '@track-aws/application';

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
