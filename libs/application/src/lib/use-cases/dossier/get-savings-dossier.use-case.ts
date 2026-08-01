import { z } from 'zod';
import type { IDossierReader } from '../../ports/dossier/dossier.port';

const GetSavingsDossierInputSchema = z.object({
  tenantId: z.string().min(1),
  dossierId: z.string().min(1).optional(),
  scanId: z.string().min(1).optional(),
});

export interface SavingsDossierDto {
  tenantId: string;
  dossierId: string;
  scanId: string;
  accountId: string;
  title: string;
  markdownBody: string;
  totalEstimatedMonthlySavingsUsd: number;
  findingIds: string[];
  remediationSteps: {
    order: number;
    title: string;
    instruction: string;
    estimatedMinutes: number | null;
  }[];
  createdAtIso: string;
}

export class GetSavingsDossierUseCase {
  constructor(private readonly dossierReader: IDossierReader) {}

  async execute(raw: unknown): Promise<SavingsDossierDto | null> {
    const input = GetSavingsDossierInputSchema.parse(raw);

    const dossier = input.dossierId
      ? await this.dossierReader.findById(input.tenantId, input.dossierId)
      : input.scanId
        ? await this.dossierReader.findLatestByScan(input.tenantId, input.scanId)
        : null;

    if (!dossier) return null;

    return {
      tenantId: dossier.tenantId,
      dossierId: dossier.dossierId,
      scanId: dossier.scanId,
      accountId: dossier.accountId,
      title: dossier.title,
      markdownBody: dossier.markdownBody,
      totalEstimatedMonthlySavingsUsd: dossier.totalEstimatedMonthlySavings.amount,
      findingIds: [...dossier.findingIds],
      remediationSteps: dossier.remediationSteps.map((s) => s.toJSON()),
      createdAtIso: dossier.createdAtIso,
    };
  }
}
