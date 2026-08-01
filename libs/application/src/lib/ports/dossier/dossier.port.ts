import type { Finding } from '@track-aws/domain';
import type { SavingsDossier } from '@track-aws/domain';
import type { RemediationStepProps } from '@track-aws/domain';

export interface DossierAiGenerateInput {
  tenantId: string;
  scanId: string;
  accountId: string;
  findings: Finding[];
  roleTone: 'finops_admin' | 'analyst' | 'viewer';
}

export interface DossierAiGenerateResult {
  title: string;
  markdownBody: string;
  remediationSteps: RemediationStepProps[];
}

export interface IDossierAiGenerator {
  generate(input: DossierAiGenerateInput): Promise<DossierAiGenerateResult>;
}

export interface IDossierWriter {
  save(dossier: SavingsDossier): Promise<void>;
}

export interface IDossierReader {
  findById(tenantId: string, dossierId: string): Promise<SavingsDossier | null>;
  findLatestByScan(
    tenantId: string,
    scanId: string,
  ): Promise<SavingsDossier | null>;
}

export interface IDossierEventNotifier {
  publishDossierReady(input: {
    tenantId: string;
    dossierId: string;
    scanId: string;
    title: string;
    totalEstimatedMonthlySavingsUsd: number;
  }): Promise<void>;
}
