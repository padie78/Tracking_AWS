/** Métricas efímeras serializables (hop SQS); no se persisten crudos. */
export interface InventoryUtilizationSnapshot {
  avgCpuPercent: number;
  avgMemoryPercent: number | null;
  sampleWindowDays: number;
}

/** Snapshot efímero de EC2 (FinOps / rightsizing). */
export interface InventoryEc2InstanceSnapshot {
  instanceId: string;
  instanceArn: string;
  instanceType: string;
  region: string;
  state: string;
  utilization: InventoryUtilizationSnapshot;
  estimatedMonthlyCostUsd: number;
}

export interface InventoryEbsVolumeSnapshot {
  volumeId: string;
  volumeArn: string;
  region: string;
  sizeGb: number;
  attached: boolean;
  estimatedMonthlyCostUsd: number;
}

export interface InventoryElasticIpSnapshot {
  allocationId: string;
  publicIp: string;
  region: string;
  associated: boolean;
  estimatedMonthlyCostUsd: number;
}

/** Recurso genérico del catálogo multi-servicio. */
export interface InventoryListedResourceSnapshot {
  resourceType: string;
  resourceId: string;
  resourceArn: string;
  region: string;
  state: string;
  detail: string;
  estimatedMonthlyCostUsd: number;
}

export interface AwsInventorySnapshot {
  accountId: string;
  capturedAtIso: string;
  ec2Instances: InventoryEc2InstanceSnapshot[];
  ebsVolumes: InventoryEbsVolumeSnapshot[];
  elasticIps: InventoryElasticIpSnapshot[];
  /** Catálogo amplio (incluye EC2/EBS/EIP + S3/RDS/Lambda/…). */
  listedResources: InventoryListedResourceSnapshot[];
}

/** @deprecated Usar nombres Inventory* — alias de compatibilidad. */
export type McpUtilizationSnapshot = InventoryUtilizationSnapshot;
export type McpEc2InstanceSnapshot = InventoryEc2InstanceSnapshot;
export type McpEbsVolumeSnapshot = InventoryEbsVolumeSnapshot;
export type McpElasticIpSnapshot = InventoryElasticIpSnapshot;
export type McpInventorySnapshot = AwsInventorySnapshot;

/**
 * Puerto de inventario AWS (cross-account AssumeRole o MCP).
 * La implementación debe mantener los datos solo en memoria del invocation.
 */
export interface IAwsInventoryPort {
  fetchInventory(input: {
    tenantId: string;
    accountId: string;
    roleArn: string;
    externalId: string;
    regions?: readonly string[];
  }): Promise<AwsInventorySnapshot>;
}

/** @deprecated Alias — preferí IAwsInventoryPort. */
export type IMcpAwsInventoryPort = IAwsInventoryPort;
