import type { EventBridgeHandler } from 'aws-lambda';
import {
  DynamoDbAlertChannelRepository,
  type DigestTip,
} from './composition-root';

type DigestDetail = {
  tenantId: string;
  auditId: string;
  accountId: string;
  severity: string;
  globalScore: number;
  estimatedMonthlySavingsUsd: number;
  security: DigestTip[];
  savings: DigestTip[];
  inconsistencies: DigestTip[];
  summary: {
    securityCount: number;
    savingsCount: number;
    inconsistencyCount: number;
    projectedMonthlySavingsUsd: number;
  };
};

function slackPayload(detail: DigestDetail): Record<string, unknown> {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Track_AWS · ${detail.accountId}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Score:* ${detail.globalScore} · *Ahorro:* $${detail.estimatedMonthlySavingsUsd.toFixed(2)}/mes · *Severidad:* ${detail.severity}`,
      },
    },
  ];

  const pushSection = (title: string, tips: DigestTip[]) => {
    if (!tips.length) return;
    const body = tips
      .slice(0, 5)
      .map((t) => `• *${t.title}*\n  ${t.recommendedAction}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${title}*\n${body}` },
    });
  };

  pushSection('Seguridad', detail.security);
  pushSection('Tips de ahorro', detail.savings);
  pushSection('Inconsistencias', detail.inconsistencies);

  return { text: `Track_AWS digest ${detail.accountId}`, blocks };
}

function genericPayload(detail: DigestDetail): Record<string, unknown> {
  return {
    source: 'trackaws.audit',
    type: 'AuditCustomerDigest',
    ...detail,
  };
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}

export const handler: EventBridgeHandler<
  'AuditCustomerDigest',
  DigestDetail,
  void
> = async (event) => {
  const detail = event.detail;
  if (!detail?.tenantId) {
    console.warn('alert_dispatcher: missing tenantId');
    return;
  }

  const repo = new DynamoDbAlertChannelRepository();
  const channels = await repo.listByTenant(detail.tenantId);
  const enabled = channels.filter((c) => c.enabled);

  for (const channel of enabled) {
    try {
      const wantsSecurity = channel.accepts('security') && detail.security.length;
      const wantsSavings = channel.accepts('savings') && detail.savings.length;
      const wantsInconsistency =
        channel.accepts('inconsistency') && detail.inconsistencies.length;
      if (!wantsSecurity && !wantsSavings && !wantsInconsistency) continue;

      if (channel.kind === 'email') {
        // Email vía SNS topic (suscripción confirmada en AWS Console / Terraform)
        console.info('alert_dispatcher: email channel — use SNS subscription', {
          target: channel.target,
          channelId: channel.channelId,
        });
        continue;
      }

      const body =
        channel.kind === 'slack'
          ? slackPayload(detail)
          : genericPayload(detail);
      await postJson(channel.target, body);
    } catch (err) {
      console.error('alert_dispatcher channel failed', {
        channelId: channel.channelId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
