/** Payloads tipados para mutations/subscriptions AppSync. */

export interface ScanStatusChangedEvent {
  tenantId: string;
  scanId: string;
  accountId: string;
  status: string;
  findingCount: number;
  estimatedMonthlySavingsUsd: number;
}

export interface FindingReadyEvent {
  tenantId: string;
  scanId: string;
  findingId: string;
  category: string;
  estimatedMonthlySavingsUsd: number;
  title: string;
}

export interface DossierReadyEvent {
  tenantId: string;
  dossierId: string;
  scanId: string;
  title: string;
  totalEstimatedMonthlySavingsUsd: number;
}
