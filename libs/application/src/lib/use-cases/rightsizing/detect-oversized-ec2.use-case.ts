import { Finding, InstanceType, UtilizationMetrics } from '@track-aws/domain';
import { AnalyzerQueueMessageSchema } from '../../dto/scan/scan-queue-message.dto';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type {
  IFindingWriter,
  IFindingEventNotifier,
} from '../../ports/findings/finding.port';
import type { McpInventorySnapshot } from '../../ports/mcp/mcp-aws-inventory.port';

export interface DetectOversizedEc2Deps {
  findingWriter: IFindingWriter;
  findingNotifier?: IFindingEventNotifier;
  idGenerator: IIdGenerator;
  cpuThresholdPercent?: number;
  memoryThresholdPercent?: number;
  logger?: ILogger;
}

export class DetectOversizedEc2UseCase {
  constructor(private readonly deps: DetectOversizedEc2Deps) {}

  async execute(raw: unknown): Promise<{ findingCount: number }> {
    const message = AnalyzerQueueMessageSchema.parse(raw);
    const inventory = message.inventoryPayload as McpInventorySnapshot;
    const cpuThreshold = this.deps.cpuThresholdPercent ?? 20;
    const memoryThreshold = this.deps.memoryThresholdPercent ?? 30;

    let findingCount = 0;

    for (const instance of inventory.ec2Instances ?? []) {
      if (instance.state !== 'running') continue;

      const utilization = UtilizationMetrics.from({
        avgCpuPercent: instance.utilization.avgCpuPercent,
        avgMemoryPercent: instance.utilization.avgMemoryPercent,
        sampleWindowDays: instance.utilization.sampleWindowDays,
      });

      if (!utilization.isUnderutilized(cpuThreshold, memoryThreshold)) continue;

      const currentType = InstanceType.from(instance.instanceType);
      const estimatedSavings = Math.round(instance.estimatedMonthlyCostUsd * 0.4 * 100) / 100;

      const finding = Finding.create({
        tenantId: message.tenantId,
        scanId: message.scanId,
        findingId: this.deps.idGenerator.generate(),
        category: 'rightsizing',
        resourceArn: instance.instanceArn,
        resourceId: instance.instanceId,
        region: instance.region,
        title: `EC2 ${instance.instanceId} sobredimensionada (${currentType.value})`,
        rationale: `CPU avg ${utilization.avgCpuPercent}%` +
          (utilization.avgMemoryPercent !== null
            ? `, Memory avg ${utilization.avgMemoryPercent}%`
            : '') +
          ` en ventana de ${utilization.sampleWindowDays} días.`,
        severity: estimatedSavings >= 100 ? 'high' : 'medium',
        estimatedMonthlySavingsUsd: estimatedSavings,
        recommendedAction: `Evaluar downsize de ${currentType.value} a una familia/tamaño inferior según carga.`,
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

    this.deps.logger?.info('Right-sizing completado', {
      scanId: message.scanId,
      findingCount,
    });

    return { findingCount };
  }
}
