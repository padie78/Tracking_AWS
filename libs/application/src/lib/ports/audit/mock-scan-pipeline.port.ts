export type MockScanPipelineWriteInput = {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
  regions?: string[];
};

export type MockScanPipelineWriteResult = {
  bucket: string;
  keys: {
    cloudquery: string;
    prowler: string;
    trivy: string;
    komiser: string;
    infracost: string;
  };
};

export interface IMockScanPipeline {
  writeArtifactsAndStartAggregate(
    input: MockScanPipelineWriteInput,
  ): Promise<MockScanPipelineWriteResult>;
}
