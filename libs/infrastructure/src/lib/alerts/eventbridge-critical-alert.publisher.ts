import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
  classifyAlertCategory,
  type DigestTip,
  type AlertCategoryFilter,
} from '@track-aws/domain';
import type { FindingDomain, AuditSeverity } from '@track-aws/domain';

export interface FindingForDigest {
  domain: FindingDomain;
  category: string;
  severity: AuditSeverity;
  title: string;
  recommendedAction: string;
  estimatedMonthlySavingsUsd: number;
  resourceId: string;
}

export interface CustomerDigestInput {
  tenantId: string;
  auditId: string;
  accountId: string;
  globalScore: number;
  estimatedMonthlySavingsUsd: number;
  findings: FindingForDigest[];
}

function tipFrom(f: FindingForDigest): DigestTip {
  return {
    category: classifyAlertCategory(f),
    severity: f.severity,
    domain: f.domain,
    title: f.title,
    recommendedAction: f.recommendedAction,
    estimatedMonthlySavingsUsd: f.estimatedMonthlySavingsUsd,
    resourceId: f.resourceId,
  };
}

function section(
  tips: DigestTip[],
  category: AlertCategoryFilter,
  limit = 8,
): DigestTip[] {
  return tips.filter((t) => t.category === category).slice(0, limit);
}

/**
 * Emite digest al cliente: seguridad, tips de ahorro e inconsistencias.
 * EventBridge (dispatcher/webhooks) + SNS (email/Slack vía suscripción).
 */
export class CustomerAuditDigestPublisher {
  private readonly events = new EventBridgeClient({});
  private readonly sns = new SNSClient({});

  async publish(input: CustomerDigestInput): Promise<void> {
    const tips = input.findings.map(tipFrom);
    const security = section(tips, 'security');
    const savings = section(tips, 'savings');
    const inconsistencies = section(tips, 'inconsistency');

    const actionable =
      security.length + savings.length + inconsistencies.length;
    if (actionable === 0) return;

    const criticalCount = input.findings.filter(
      (f) => f.severity === 'CRITICAL',
    ).length;
    const highCount = input.findings.filter((f) => f.severity === 'HIGH').length;
    const severity =
      criticalCount > 0 ? 'CRITICAL' : highCount > 0 ? 'HIGH' : 'INFO';

    const busName = process.env['AUDIT_EVENT_BUS_NAME'] ?? 'default';
    const detail = {
      tenantId: input.tenantId,
      auditId: input.auditId,
      accountId: input.accountId,
      severity,
      globalScore: input.globalScore,
      estimatedMonthlySavingsUsd: input.estimatedMonthlySavingsUsd,
      criticalCount,
      highCount,
      security,
      savings,
      inconsistencies,
      summary: {
        securityCount: security.length,
        savingsCount: savings.length,
        inconsistencyCount: inconsistencies.length,
        projectedMonthlySavingsUsd: Math.round(
          savings.reduce((a, t) => a + t.estimatedMonthlySavingsUsd, 0) * 100,
        ) / 100,
      },
    };

    await this.events.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: busName,
            Source: 'trackaws.audit',
            DetailType: 'AuditCustomerDigest',
            Detail: JSON.stringify(detail),
          },
        ],
      }),
    );

    // Compat: también CRITICAL findings event
    if (criticalCount > 0 || highCount > 0) {
      await this.events.send(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: busName,
              Source: 'trackaws.audit',
              DetailType: 'AuditCriticalFindings',
              Detail: JSON.stringify({
                tenantId: input.tenantId,
                auditId: input.auditId,
                accountId: input.accountId,
                criticalCount,
                highCount,
                titles: [...security, ...inconsistencies]
                  .filter(
                    (t) => t.severity === 'CRITICAL' || t.severity === 'HIGH',
                  )
                  .map((t) => t.title)
                  .slice(0, 10),
                severity,
              }),
            },
          ],
        }),
      );
    }

    const topicArn = process.env['AUDIT_ALERTS_TOPIC_ARN'];
    if (!topicArn) return;

    const lines = [
      `Track_AWS — Digest de auditoría`,
      `Cuenta: ${input.accountId} · Audit: ${input.auditId}`,
      `Score global: ${input.globalScore} · Ahorro proyectado: $${input.estimatedMonthlySavingsUsd.toFixed(2)}/mes`,
      '',
    ];
    if (security.length) {
      lines.push('## Seguridad');
      for (const t of security) {
        lines.push(`- [${t.severity}] ${t.title}`);
        lines.push(`  → ${t.recommendedAction}`);
      }
      lines.push('');
    }
    if (savings.length) {
      lines.push('## Tips de ahorro');
      for (const t of savings) {
        lines.push(
          `- $${t.estimatedMonthlySavingsUsd.toFixed(2)}/mes — ${t.title} (${t.resourceId})`,
        );
        lines.push(`  → ${t.recommendedAction}`);
      }
      lines.push('');
    }
    if (inconsistencies.length) {
      lines.push('## Inconsistencias / arquitectura');
      for (const t of inconsistencies) {
        lines.push(`- [${t.severity}] ${t.title}`);
        lines.push(`  → ${t.recommendedAction}`);
      }
    }

    await this.sns.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: `[Track_AWS] Digest ${input.accountId} (${severity})`,
        Message: lines.join('\n'),
      }),
    );
  }
}

/** @deprecated Prefer CustomerAuditDigestPublisher */
export class EventBridgeCriticalAlertPublisher extends CustomerAuditDigestPublisher {}
