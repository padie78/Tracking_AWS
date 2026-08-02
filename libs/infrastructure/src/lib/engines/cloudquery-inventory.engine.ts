import { randomUUID } from 'node:crypto';
import {
  AuditFinding,
  type AuditPayload,
  type FinOpsFinding,
} from '@track-aws/domain';
import {
  summarizeInventoryResources,
  type AwsInventorySnapshot,
  type IAwsInventoryPort,
  type InventoryResourceView,
} from '@track-aws/application';
import { snapshotToResources } from './snapshot-resources.util';

/**
 * Motor de inventario estilo CloudQuery en Lambda:
 * AssumeRole → snapshot multi-servicio → recursos tipados + findings FinOps.
 */
export class CloudQueryInventoryEngine {
  constructor(private readonly inventory: IAwsInventoryPort) {}

  async run(payload: AuditPayload): Promise<{
    inventorySummary: ReturnType<typeof summarizeInventoryResources>;
    resources: InventoryResourceView[];
    finopsFindings: FinOpsFinding[];
    auditFindings: AuditFinding[];
  }> {
    const snapshot = await this.inventory.fetchInventory({
      tenantId: payload.tenantId,
      accountId: payload.accountId,
      roleArn: payload.roleArn,
      externalId: payload.externalId,
      regions: payload.regions,
    });

    const resources = snapshotToResources(snapshot);
    const finops = this.analyzeFinOps(snapshot);
    const auditFindings = finops.map((f) =>
      AuditFinding.create({
        tenantId: payload.tenantId,
        auditId: payload.auditId,
        findingId: f.findingId,
        domain: 'finops',
        category: f.category,
        severity: f.severity,
        resourceArn: f.resourceArn,
        resourceId: f.resourceId,
        region: f.region,
        title: f.title,
        rationale: f.rationale,
        recommendedAction: f.recommendedAction,
        estimatedMonthlySavingsUsd: f.estimatedMonthlySavingsUsd,
        checkId: `cq.finops.${f.category}`,
      }),
    );

    return {
      inventorySummary: summarizeInventoryResources(resources),
      resources,
      finopsFindings: finops,
      auditFindings,
    };
  }

  private analyzeFinOps(snapshot: AwsInventorySnapshot): FinOpsFinding[] {
    const out: FinOpsFinding[] = [];

    for (const inst of snapshot.ec2Instances) {
      if (inst.state !== 'running') continue;
      const cpu = inst.utilization.avgCpuPercent;
      if (cpu < 10 && inst.estimatedMonthlyCostUsd >= 15) {
        const savings = Math.round(inst.estimatedMonthlyCostUsd * 0.45 * 100) / 100;
        out.push({
          findingId: randomUUID(),
          category: 'rightsizing',
          severity: cpu < 5 ? 'HIGH' : 'MEDIUM',
          resourceArn: inst.instanceArn,
          resourceId: inst.instanceId,
          region: inst.region,
          title: `EC2 sobredimensionada: ${inst.instanceType}`,
          rationale: `CPU promedio ${cpu}% en 14d con costo ~USD ${inst.estimatedMonthlyCostUsd}/mes.`,
          recommendedAction:
            'Downsize a familia inferior o schedule stop fuera de horario laboral.',
          estimatedMonthlySavingsUsd: savings,
        });
      }
      if (/^t2\./.test(inst.instanceType)) {
        out.push({
          findingId: randomUUID(),
          category: 'modernization',
          severity: 'MEDIUM',
          resourceArn: inst.instanceArn,
          resourceId: inst.instanceId,
          region: inst.region,
          title: `Modernizar ${inst.instanceType} → t3/t3a`,
          rationale: 'Familia t2 legacy; t3 ofrece mejor precio/performance.',
          recommendedAction: 'Migrar a t3 equivalent size y validar burstable credits.',
          estimatedMonthlySavingsUsd:
            Math.round(inst.estimatedMonthlyCostUsd * 0.15 * 100) / 100,
        });
      }
    }

    for (const vol of snapshot.ebsVolumes) {
      if (!vol.attached) {
        out.push({
          findingId: randomUUID(),
          category: 'orphaned',
          severity: 'HIGH',
          resourceArn: vol.volumeArn,
          resourceId: vol.volumeId,
          region: vol.region,
          title: `EBS no adjunto (${vol.sizeGb} GiB)`,
          rationale: 'Volumen sin attachments — waste de almacenamiento.',
          recommendedAction: 'Snapshot + delete si no es requerido, o re-adjuntar.',
          estimatedMonthlySavingsUsd: vol.estimatedMonthlyCostUsd,
        });
      }
    }

    for (const eip of snapshot.elasticIps) {
      if (!eip.associated) {
        out.push({
          findingId: randomUUID(),
          category: 'orphaned',
          severity: 'MEDIUM',
          resourceArn: `arn:aws:ec2:${eip.region}:${snapshot.accountId}:elastic-ip/${eip.allocationId}`,
          resourceId: eip.allocationId,
          region: eip.region,
          title: `Elastic IP idle ${eip.publicIp}`,
          rationale: 'EIP no asociada genera cargo horario.',
          recommendedAction: 'Release EIP o asociar a instancia/NAT.',
          estimatedMonthlySavingsUsd: eip.estimatedMonthlyCostUsd,
        });
      }
    }

    return out;
  }
}

export { snapshotToResources } from './snapshot-resources.util';
