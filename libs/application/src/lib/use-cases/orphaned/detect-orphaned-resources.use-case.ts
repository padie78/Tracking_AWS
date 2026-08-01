import { Finding } from '@track-aws/domain';
import { AnalyzerQueueMessageSchema } from '../../dto/scan/scan-queue-message.dto';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type {
  IFindingWriter,
  IFindingEventNotifier,
} from '../../ports/findings/finding.port';
import type { McpInventorySnapshot } from '../../ports/mcp/mcp-aws-inventory.port';

export interface DetectOrphanedResourcesDeps {
  findingWriter: IFindingWriter;
  findingNotifier?: IFindingEventNotifier;
  idGenerator: IIdGenerator;
  logger?: ILogger;
}

export class DetectOrphanedResourcesUseCase {
  constructor(private readonly deps: DetectOrphanedResourcesDeps) {}

  async execute(raw: unknown): Promise<{ findingCount: number }> {
    const message = AnalyzerQueueMessageSchema.parse(raw);
    const inventory = message.inventoryPayload as McpInventorySnapshot;
    let findingCount = 0;

    for (const volume of inventory.ebsVolumes ?? []) {
      if (volume.attached) continue;

      const finding = Finding.create({
        tenantId: message.tenantId,
        scanId: message.scanId,
        findingId: this.deps.idGenerator.generate(),
        category: 'orphaned',
        resourceArn: volume.volumeArn,
        resourceId: volume.volumeId,
        region: volume.region,
        title: `EBS huérfano ${volume.volumeId} (${volume.sizeGb} GiB)`,
        rationale: 'Volumen EBS sin adjuntar a ninguna instancia EC2.',
        severity: volume.estimatedMonthlyCostUsd >= 50 ? 'high' : 'medium',
        estimatedMonthlySavingsUsd: volume.estimatedMonthlyCostUsd,
        recommendedAction:
          'Snapshot (si se requiere retención) y eliminar el volumen no adjunto.',
      });

      await this.deps.findingWriter.save(finding);
      await this.deps.findingNotifier?.publishFindingReady({
        tenantId: finding.tenantId,
        scanId: finding.scanId,
        findingId: finding.findingId,
        category: finding.category,
        estimatedMonthlySavingsUsd: finding.estimatedMonthlySavings.amount,
        title: finding.title,
      });
      findingCount += 1;
    }

    for (const eip of inventory.elasticIps ?? []) {
      if (eip.associated) continue;

      const finding = Finding.create({
        tenantId: message.tenantId,
        scanId: message.scanId,
        findingId: this.deps.idGenerator.generate(),
        category: 'orphaned',
        resourceArn: `arn:aws:ec2:${eip.region}:eip:${eip.allocationId}`,
        resourceId: eip.allocationId,
        region: eip.region,
        title: `Elastic IP inactiva ${eip.publicIp}`,
        rationale: 'Elastic IP asignada sin asociación a instancia o ENI.',
        severity: 'low',
        estimatedMonthlySavingsUsd: eip.estimatedMonthlyCostUsd,
        recommendedAction: 'Liberar la Elastic IP no asociada.',
      });

      await this.deps.findingWriter.save(finding);
      await this.deps.findingNotifier?.publishFindingReady({
        tenantId: finding.tenantId,
        scanId: finding.scanId,
        findingId: finding.findingId,
        category: finding.category,
        estimatedMonthlySavingsUsd: finding.estimatedMonthlySavings.amount,
        title: finding.title,
      });
      findingCount += 1;
    }

    this.deps.logger?.info('Detección de huérfanos completada', {
      scanId: message.scanId,
      findingCount,
    });

    return { findingCount };
  }
}
