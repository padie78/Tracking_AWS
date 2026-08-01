import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AuditFinding, AuditJob } from '@track-aws/domain';
import { DynamoKeys, EntityType } from '@track-aws/common';
import { getDocumentClient } from '../aws/dynamodb-client.factory';
import { randomUUID } from 'node:crypto';

export interface AuditReportResult {
  reportId: string;
  s3Key: string;
  bucket: string;
  executiveSummaryMarkdown: string;
}

/**
 * Genera executive summary Markdown + artefacto en S3 (PDF-ready text/markdown).
 * Persist metadata en DynamoDB REPORT#.
 */
export class AuditReportGenerator {
  private readonly s3 = new S3Client({});
  private readonly doc = getDocumentClient();

  async generate(input: {
    audit: AuditJob;
    findings: AuditFinding[];
  }): Promise<AuditReportResult> {
    const bucket = process.env['REPORTS_BUCKET_NAME'];
    if (!bucket) throw new Error('Missing env REPORTS_BUCKET_NAME');

    const reportId = randomUUID();
    const executiveSummaryMarkdown = this.buildMarkdown(
      input.audit,
      input.findings,
    );
    const s3Key = `tenants/${input.audit.tenantId}/audits/${input.audit.auditId}/reports/${reportId}.md`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: executiveSummaryMarkdown,
        ContentType: 'text/markdown; charset=utf-8',
        ServerSideEncryption: 'AES256',
        Metadata: {
          tenantId: input.audit.tenantId,
          auditId: input.audit.auditId,
          reportId,
        },
      }),
    );

    const table = process.env['CORE_TABLE_NAME'];
    if (!table) throw new Error('Missing env CORE_TABLE_NAME');

    await this.doc.send(
      new PutCommand({
        TableName: table,
        Item: {
          PK: DynamoKeys.tenantPk(input.audit.tenantId),
          SK: DynamoKeys.reportSk(reportId),
          entityType: EntityType.AuditReport,
          tenantId: input.audit.tenantId,
          auditId: input.audit.auditId,
          reportId,
          bucket,
          s3Key,
          createdAtIso: new Date().toISOString(),
          contentType: 'text/markdown',
        },
      }),
    );

    return { reportId, s3Key, bucket, executiveSummaryMarkdown };
  }

  private buildMarkdown(audit: AuditJob, findings: AuditFinding[]): string {
    const critical = findings.filter((f) => f.severity === 'CRITICAL');
    const high = findings.filter((f) => f.severity === 'HIGH');
    const savings = audit.estimatedMonthlySavingsUsd;

    const lines = [
      `# Executive Summary — Audit ${audit.auditId}`,
      '',
      `**Account:** ${audit.accountId}  `,
      `**Global WAF score:** ${audit.globalScore}/100  `,
      `**Estimated monthly savings:** USD ${savings.toFixed(2)}  `,
      `**Findings:** ${findings.length} (CRITICAL ${critical.length}, HIGH ${high.length})`,
      '',
      '## Pillar scores',
      '',
      `| Pillar | Score |`,
      `|---|---:|`,
      `| Operational Excellence | ${audit.pillarScores.operationalExcellence} |`,
      `| Security | ${audit.pillarScores.security} |`,
      `| Reliability | ${audit.pillarScores.reliability} |`,
      `| Performance Efficiency | ${audit.pillarScores.performanceEfficiency} |`,
      `| Cost Optimization | ${audit.pillarScores.costOptimization} |`,
      `| Sustainability | ${audit.pillarScores.sustainability} |`,
      '',
      '## Top risks',
      '',
    ];

    for (const f of [...critical, ...high].slice(0, 15)) {
      lines.push(`### ${f.severity}: ${f.title}`);
      lines.push('');
      lines.push(f.rationale);
      lines.push('');
      lines.push(`**Remediation:** ${f.recommendedAction}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
