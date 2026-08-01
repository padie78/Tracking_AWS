import { Finding, InstanceType } from '@track-aws/domain';
import { AnalyzerQueueMessageSchema } from '../../dto/scan/scan-queue-message.dto';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type {
  IFindingWriter,
  IFindingEventNotifier,
} from '../../ports/findings/finding.port';
import type { McpInventorySnapshot } from '../../ports/mcp/mcp-aws-inventory.port';

const LEGACY_TO_MODERN: ReadonlyMap<string, string> = new Map([
  ['t2', 't3'],
  ['m4', 'm6i'],
  ['c4', 'c6i'],
  ['r4', 'r6i'],
]);

const X86_TO_GRAVITON: ReadonlyMap<string, string> = new Map([
  ['t3', 't4g'],
  ['m6i', 'm7g'],
  ['c6i', 'c7g'],
  ['r6i', 'r7g'],
]);

export interface RecommendInstanceModernizationDeps {
  findingWriter: IFindingWriter;
  findingNotifier?: IFindingEventNotifier;
  idGenerator: IIdGenerator;
  logger?: ILogger;
}

export class RecommendInstanceModernizationUseCase {
  constructor(private readonly deps: RecommendInstanceModernizationDeps) {}

  async execute(raw: unknown): Promise<{ findingCount: number }> {
    const message = AnalyzerQueueMessageSchema.parse(raw);
    const inventory = message.inventoryPayload as McpInventorySnapshot;
    let findingCount = 0;

    for (const instance of inventory.ec2Instances ?? []) {
      if (instance.state !== 'running') continue;

      const current = InstanceType.from(instance.instanceType);
      const size = current.value.split('.')[1] ?? 'medium';
      const modernFamily = LEGACY_TO_MODERN.get(current.family);
      const gravitonFamily =
        X86_TO_GRAVITON.get(modernFamily ?? current.family) ??
        X86_TO_GRAVITON.get(current.family);

      if (!modernFamily && !gravitonFamily) continue;

      const targetFamily = gravitonFamily ?? modernFamily!;
      const targetType = `${targetFamily}.${size}`;
      const savingsRatio = gravitonFamily ? 0.2 : 0.15;
      const estimatedSavings =
        Math.round(instance.estimatedMonthlyCostUsd * savingsRatio * 100) / 100;

      const finding = Finding.create({
        tenantId: message.tenantId,
        scanId: message.scanId,
        findingId: this.deps.idGenerator.generate(),
        category: 'modernization',
        resourceArn: instance.instanceArn,
        resourceId: instance.instanceId,
        region: instance.region,
        title: `Modernizar ${current.value} → ${targetType}`,
        rationale: gravitonFamily
          ? `Familia ${current.family} candidata a Graviton (${targetFamily}) con mejor precio/rendimiento.`
          : `Familia legacy ${current.family} → generación actual ${modernFamily}.`,
        severity: estimatedSavings >= 80 ? 'high' : 'medium',
        estimatedMonthlySavingsUsd: estimatedSavings,
        recommendedAction: `Planificar migración de ${current.value} a ${targetType} (AMI compatible / rehydrate).`,
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

    this.deps.logger?.info('Modernización completada', {
      scanId: message.scanId,
      findingCount,
    });

    return { findingCount };
  }
}
