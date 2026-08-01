import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { AuditFinding, AuditJob } from '@track-aws/domain';
import { DynamoKeys, EntityType } from '@track-aws/common';
import { getDocumentClient } from '../aws/dynamodb-client.factory';

export type InventorySummaryView = {
  ec2Count: number;
  ebsCount: number;
  eipCount: number;
  runningEc2Count: number;
  stoppedEc2Count: number;
  unattachedEbsCount: number;
  idleEipCount: number;
};

export interface AuditReportResult {
  reportId: string;
  s3Key: string;
  bucket: string;
  executiveSummaryMarkdown: string;
  aiGenerated: boolean;
  inventorySummary: InventorySummaryView | null;
}

export interface AuditReportRecord {
  tenantId: string;
  auditId: string;
  reportId: string;
  accountId: string;
  markdownBody: string;
  aiGenerated: boolean;
  inventorySummary: InventorySummaryView | null;
  bucket: string;
  s3Key: string;
  createdAtIso: string;
  globalScore: number;
  estimatedMonthlySavingsUsd: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
}

/**
 * Executive report: plantilla estructurada + sección IA (Bedrock) si hay modelo.
 * Persist markdown completo en Dynamo (REPORT#auditId) + artefacto S3.
 */
export class AuditReportGenerator {
  private readonly s3 = new S3Client({});
  private readonly doc = getDocumentClient();
  private readonly bedrock = new BedrockRuntimeClient({});

  async generate(input: {
    audit: AuditJob;
    findings: AuditFinding[];
    inventorySummary?: InventorySummaryView | null;
  }): Promise<AuditReportResult> {
    const bucket = process.env['REPORTS_BUCKET_NAME'];
    if (!bucket) throw new Error('Missing env REPORTS_BUCKET_NAME');

    const inventory = normalizeInventory(input.inventorySummary);
    const structured = this.buildStructuredMarkdown(
      input.audit,
      input.findings,
      inventory,
    );

    let aiSection = '';
    let aiGenerated = false;
    try {
      aiSection = await this.generateAiNarrative({
        audit: input.audit,
        findings: input.findings,
        inventory,
      });
      if (aiSection.trim()) aiGenerated = true;
    } catch (err) {
      console.warn('Bedrock audit report falló; se usa solo plantilla', {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const executiveSummaryMarkdown = aiGenerated
      ? `${structured}\n\n---\n\n${aiSection}`
      : structured;

    const reportId = input.audit.auditId;
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
          aiGenerated: String(aiGenerated),
        },
      }),
    );

    const table = process.env['CORE_TABLE_NAME'];
    if (!table) throw new Error('Missing env CORE_TABLE_NAME');

    const createdAtIso = new Date().toISOString();
    await this.doc.send(
      new PutCommand({
        TableName: table,
        Item: {
          PK: DynamoKeys.tenantPk(input.audit.tenantId),
          SK: DynamoKeys.reportSk(reportId),
          entityType: EntityType.AuditReport,
          tenantId: input.audit.tenantId,
          auditId: input.audit.auditId,
          accountId: input.audit.accountId,
          reportId,
          bucket,
          s3Key,
          createdAtIso,
          contentType: 'text/markdown',
          markdownBody: executiveSummaryMarkdown,
          aiGenerated,
          inventorySummary: inventory,
          globalScore: input.audit.globalScore,
          estimatedMonthlySavingsUsd: input.audit.estimatedMonthlySavingsUsd,
          findingCount: input.audit.findingCount,
          criticalCount: input.audit.criticalCount,
          highCount: input.audit.highCount,
        },
      }),
    );

    return {
      reportId,
      s3Key,
      bucket,
      executiveSummaryMarkdown,
      aiGenerated,
      inventorySummary: inventory,
    };
  }

  async findByAuditId(
    tenantId: string,
    auditId: string,
  ): Promise<AuditReportRecord | null> {
    const table = process.env['CORE_TABLE_NAME'];
    if (!table) throw new Error('Missing env CORE_TABLE_NAME');

    const result = await this.doc.send(
      new GetCommand({
        TableName: table,
        Key: {
          PK: DynamoKeys.tenantPk(tenantId),
          SK: DynamoKeys.reportSk(auditId),
        },
      }),
    );
    if (!result.Item) return null;
    const item = result.Item as Record<string, unknown>;
    return {
      tenantId: String(item['tenantId']),
      auditId: String(item['auditId']),
      reportId: String(item['reportId']),
      accountId: String(item['accountId'] ?? ''),
      markdownBody: String(item['markdownBody'] ?? ''),
      aiGenerated: Boolean(item['aiGenerated']),
      inventorySummary: normalizeInventory(
        item['inventorySummary'] as InventorySummaryView | null,
      ),
      bucket: String(item['bucket'] ?? ''),
      s3Key: String(item['s3Key'] ?? ''),
      createdAtIso: String(item['createdAtIso']),
      globalScore: Number(item['globalScore'] ?? 0),
      estimatedMonthlySavingsUsd: Number(item['estimatedMonthlySavingsUsd'] ?? 0),
      findingCount: Number(item['findingCount'] ?? 0),
      criticalCount: Number(item['criticalCount'] ?? 0),
      highCount: Number(item['highCount'] ?? 0),
    };
  }

  private buildStructuredMarkdown(
    audit: AuditJob,
    findings: AuditFinding[],
    inventory: InventorySummaryView | null,
  ): string {
    const critical = findings.filter((f) => f.severity === 'CRITICAL');
    const high = findings.filter((f) => f.severity === 'HIGH');
    const secops = findings.filter((f) => f.domain === 'secops');
    const finops = findings.filter((f) => f.domain === 'finops');
    const architecture = findings.filter((f) => f.domain === 'architecture');
    const savingsSorted = [...finops].sort(
      (a, b) => b.estimatedMonthlySavingsUsd - a.estimatedMonthlySavingsUsd,
    );

    const lines: string[] = [
      `# Informe de auditoría — ${audit.accountId}`,
      '',
      `**Audit ID:** \`${audit.auditId}\`  `,
      `**Score global WAF:** ${audit.globalScore}/100  `,
      `**Ahorro mensual estimado:** USD ${audit.estimatedMonthlySavingsUsd.toFixed(2)}  `,
      `**Hallazgos:** ${findings.length} (CRITICAL ${critical.length}, HIGH ${high.length})`,
      '',
      '## Inventario observado',
      '',
    ];

    if (inventory) {
      const healthyEc2 = Math.max(
        0,
        inventory.runningEc2Count -
          finops.filter((f) => f.category === 'rightsizing' || f.category === 'modernization')
            .length,
      );
      const healthyEbs = Math.max(
        0,
        inventory.ebsCount - inventory.unattachedEbsCount,
      );
      const healthyEip = Math.max(0, inventory.eipCount - inventory.idleEipCount);
      lines.push(
        `| Recurso | Total | OK / en uso | Riesgo / waste |`,
        `|---|---:|---:|---:|`,
        `| EC2 | ${inventory.ec2Count} | ~${healthyEc2} running sanos | ${inventory.stoppedEc2Count} stopped · findings rightsizing/modernización |`,
        `| EBS | ${inventory.ebsCount} | ${healthyEbs} adjuntos | ${inventory.unattachedEbsCount} sin adjuntar |`,
        `| Elastic IP | ${inventory.eipCount} | ${healthyEip} asociadas | ${inventory.idleEipCount} idle (cargo) |`,
        '',
        inventory.ec2Count + inventory.ebsCount + inventory.eipCount === 0
          ? '_Inventario vacío o no medido en este audit._'
          : '_Inventario efímero del motor FinOps (no se persiste raw). Contadores OK son estimados vs hallazgos._',
        '',
      );
    } else {
      lines.push('_Sin resumen de inventario en este audit._', '');
    }

    lines.push(
      '## Qué está bien / qué está mal configurado',
      '',
      `| Área | Score | Lectura |`,
      `|---|---:|---|`,
      `| Seguridad | ${audit.pillarScores.security} | ${scoreLabel(audit.pillarScores.security)} |`,
      `| Optimización de costo | ${audit.pillarScores.costOptimization} | ${scoreLabel(audit.pillarScores.costOptimization)} |`,
      `| Fiabilidad | ${audit.pillarScores.reliability} | ${scoreLabel(audit.pillarScores.reliability)} |`,
      `| Eficiencia de performance | ${audit.pillarScores.performanceEfficiency} | ${scoreLabel(audit.pillarScores.performanceEfficiency)} |`,
      '',
    );

    const goodPillars = (
      [
        ['Seguridad', audit.pillarScores.security],
        ['Costo', audit.pillarScores.costOptimization],
        ['Fiabilidad', audit.pillarScores.reliability],
        ['Performance', audit.pillarScores.performanceEfficiency],
      ] as const
    ).filter(([, s]) => s >= 85);
    if (goodPillars.length) {
      lines.push('### Bien configurado');
      lines.push('');
      for (const [name, score] of goodPillars) {
        lines.push(`- **${name}** (${score}/100): dentro de umbral saludable.`);
      }
      lines.push('');
    }
    const badPillars = (
      [
        ['Seguridad', audit.pillarScores.security],
        ['Costo', audit.pillarScores.costOptimization],
        ['Fiabilidad', audit.pillarScores.reliability],
        ['Performance', audit.pillarScores.performanceEfficiency],
      ] as const
    ).filter(([, s]) => s < 65);
    if (badPillars.length) {
      lines.push('### Mal configurado / requiere remediación');
      lines.push('');
      for (const [name, score] of badPillars) {
        lines.push(`- **${name}** (${score}/100): ${scoreLabel(score)}.`);
      }
      lines.push('');
    }

    lines.push(
      '## Superficie de ataque y vulnerabilidades (SecOps)',
      '',
    );

    if (secops.length === 0) {
      lines.push(
        '_No se reportaron hallazgos FAIL de Prowler en este audit. Eso no garantiza ausencia de riesgo: revisá cobertura de regiones y permisos del rol scanner._',
        '',
      );
    } else {
      lines.push(
        `Se detectaron **${secops.length}** controles fallidos (solo FAIL). Priorizá exposición pública, IAM excesivo y storage abierto.`,
        '',
      );
      for (const f of [...critical, ...high]
        .filter((x) => x.domain === 'secops')
        .slice(0, 12)) {
        lines.push(`### [${f.severity}] ${f.title}`);
        lines.push('');
        lines.push(`- **Recurso:** \`${f.resourceId || f.resourceArn}\` (${f.region})`);
        lines.push(`- **Categoría:** ${f.category}${f.checkId ? ` · check \`${f.checkId}\`` : ''}`);
        lines.push(`- **Riesgo:** ${f.rationale}`);
        lines.push(`- **Mitigación:** ${f.recommendedAction}`);
        lines.push('');
      }
    }

    lines.push('## Oportunidades de ahorro (FinOps)', '');
    if (savingsSorted.length === 0) {
      lines.push('_Sin tips de ahorro en este audit._', '');
    } else {
      lines.push(
        `Ahorro proyectado **USD ${audit.estimatedMonthlySavingsUsd.toFixed(2)}/mes** a partir de ${finops.length} hallazgos.`,
        '',
      );
      for (const f of savingsSorted.slice(0, 12)) {
        lines.push(
          `- **${f.title}** — USD ${f.estimatedMonthlySavingsUsd.toFixed(2)}/mes · ${f.category} · \`${f.resourceId}\``,
        );
        lines.push(`  - ${f.recommendedAction}`);
      }
      lines.push('');
    }

    if (architecture.length) {
      lines.push('## Arquitectura / Well-Architected', '');
      for (const f of architecture.slice(0, 8)) {
        lines.push(`- **${f.title}** (${f.severity}): ${f.recommendedAction}`);
      }
      lines.push('');
    }

    lines.push(
      '## Top riesgos transversales',
      '',
    );
    for (const f of [...critical, ...high].slice(0, 10)) {
      lines.push(`1. **[${f.domain}/${f.severity}] ${f.title}** — ${f.recommendedAction}`);
    }

    return lines.join('\n');
  }

  private async generateAiNarrative(input: {
    audit: AuditJob;
    findings: AuditFinding[];
    inventory: InventorySummaryView | null;
  }): Promise<string> {
    const modelId = process.env['BEDROCK_MODEL_ID']?.trim();
    if (!modelId) return '';

    const compactFindings = input.findings
      .slice()
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .slice(0, 40)
      .map((f) => ({
        domain: f.domain,
        category: f.category,
        severity: f.severity,
        title: f.title,
        resourceId: f.resourceId,
        region: f.region,
        savingsUsd: f.estimatedMonthlySavingsUsd,
        action: f.recommendedAction,
        checkId: f.checkId,
      }));

    const userPrompt = [
      'Sos un consultor FinOps/SecOps senior. Generá un informe ejecutivo en Markdown en español para el cliente dueño de la cuenta AWS.',
      'Usá tono corporativo, técnico y accionable. No inventes recursos, CVEs ni mapas que no estén en el JSON.',
      'Estructura obligatoria:',
      '## Narrativa ejecutiva',
      '## Inventario y postura',
      '## Riesgos explotables (seguridad)',
      '## Plan de ahorro 30/60/90 días',
      '## Checklist de remediación priorizada',
      '',
      'Datos del audit (JSON):',
      JSON.stringify(
        {
          accountId: input.audit.accountId,
          auditId: input.audit.auditId,
          globalScore: input.audit.globalScore,
          pillarScores: input.audit.pillarScores,
          estimatedMonthlySavingsUsd: input.audit.estimatedMonthlySavingsUsd,
          inventory: input.inventory,
          findings: compactFindings,
        },
        null,
        2,
      ),
    ].join('\n');

    const body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1800,
      temperature: 0.2,
      messages: [{ role: 'user', content: userPrompt }],
    };

    const response = await this.bedrock.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: Buffer.from(JSON.stringify(body)),
      }),
    );

    const raw = new TextDecoder().decode(response.body);
    const parsed = JSON.parse(raw) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = parsed.content?.map((c) => c.text ?? '').join('\n').trim();
    if (!text) return '';
    return `## Análisis IA (Bedrock)\n\n${text}`;
  }
}

function normalizeInventory(
  value: InventorySummaryView | null | undefined,
): InventorySummaryView | null {
  if (!value || typeof value !== 'object') return null;
  const ec2Count = Number(value.ec2Count ?? 0);
  const ebsCount = Number(value.ebsCount ?? 0);
  const eipCount = Number(value.eipCount ?? 0);
  return {
    ec2Count,
    ebsCount,
    eipCount,
    runningEc2Count: Number(value.runningEc2Count ?? ec2Count),
    stoppedEc2Count: Number(value.stoppedEc2Count ?? 0),
    unattachedEbsCount: Number(value.unattachedEbsCount ?? 0),
    idleEipCount: Number(value.idleEipCount ?? 0),
  };
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Bien configurado';
  if (score >= 65) return 'Aceptable con gaps';
  if (score >= 40) return 'Requiere atención';
  return 'Crítico / mal configurado';
}

function severityRank(severity: string): number {
  const map: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    INFO: 4,
  };
  return map[severity] ?? 9;
}
