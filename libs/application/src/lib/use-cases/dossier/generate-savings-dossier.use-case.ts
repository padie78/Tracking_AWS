import { SavingsDossier } from '@track-aws/domain';
import {
  DossierQueueMessageSchema,
  GenerateDossierInputSchema,
} from '../../dto/dossier/dossier.dto';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type { IFindingReader } from '../../ports/findings/finding.port';
import type {
  IDossierAiGenerator,
  IDossierWriter,
  IDossierEventNotifier,
} from '../../ports/dossier/dossier.port';

export interface GenerateSavingsDossierDeps {
  findingReader: IFindingReader;
  dossierAi: IDossierAiGenerator;
  dossierWriter: IDossierWriter;
  dossierNotifier?: IDossierEventNotifier;
  idGenerator: IIdGenerator;
  logger?: ILogger;
}

export class GenerateSavingsDossierUseCase {
  constructor(private readonly deps: GenerateSavingsDossierDeps) {}

  async execute(raw: unknown): Promise<{ dossierId: string }> {
    const queueMsg = DossierQueueMessageSchema.safeParse(raw);
    const input = queueMsg.success
      ? GenerateDossierInputSchema.parse({
          tenantId: queueMsg.data.tenantId,
          scanId: queueMsg.data.scanId,
          accountId: queueMsg.data.accountId,
          roleTone: 'analyst',
        })
      : GenerateDossierInputSchema.parse(raw);

    const findings = await this.deps.findingReader.listByScan(
      input.tenantId,
      input.scanId,
    );

    const totalSavings = findings.reduce(
      (sum, f) => sum + f.estimatedMonthlySavings.amount,
      0,
    );

    const ai = await this.deps.dossierAi.generate({
      tenantId: input.tenantId,
      scanId: input.scanId,
      accountId: input.accountId,
      findings,
      roleTone: input.roleTone,
    });

    const dossierId = this.deps.idGenerator.generate();
    const dossier = SavingsDossier.create({
      tenantId: input.tenantId,
      dossierId,
      scanId: input.scanId,
      accountId: input.accountId,
      title: ai.title,
      markdownBody: ai.markdownBody,
      totalEstimatedMonthlySavingsUsd: Math.round(totalSavings * 100) / 100,
      findingIds: findings.map((f) => f.findingId),
      remediationSteps: ai.remediationSteps,
    });

    await this.deps.dossierWriter.save(dossier);
    await this.deps.dossierNotifier?.publishDossierReady({
      tenantId: dossier.tenantId,
      dossierId: dossier.dossierId,
      scanId: dossier.scanId,
      title: dossier.title,
      totalEstimatedMonthlySavingsUsd: dossier.totalEstimatedMonthlySavings.amount,
    });

    this.deps.logger?.info('Dossier de ahorro generado', {
      dossierId,
      scanId: input.scanId,
      findingCount: findings.length,
      totalSavings,
    });

    return { dossierId };
  }
}
