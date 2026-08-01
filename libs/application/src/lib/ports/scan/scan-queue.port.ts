export interface ScanQueueMessage {
  tenantId: string;
  scanId: string;
  accountId: string;
  roleArn: string;
  externalId: string;
  regions: string[];
  correlationId: string;
}

export interface IScanQueuePublisher {
  enqueue(message: ScanQueueMessage): Promise<void>;
}

export interface AnalyzerQueueMessage {
  tenantId: string;
  scanId: string;
  accountId: string;
  correlationId: string;
  /** Inventario serializado solo para el hop SQS inmediato; no se reutiliza fuera del pipeline. */
  inventoryPayload: unknown;
}

export interface IRightsizingQueuePublisher {
  enqueue(message: AnalyzerQueueMessage): Promise<void>;
}

export interface IModernizationQueuePublisher {
  enqueue(message: AnalyzerQueueMessage): Promise<void>;
}

export interface IOrphanedQueuePublisher {
  enqueue(message: AnalyzerQueueMessage): Promise<void>;
}

export interface DossierQueueMessage {
  tenantId: string;
  scanId: string;
  accountId: string;
  correlationId: string;
}

export interface IDossierQueuePublisher {
  enqueue(message: DossierQueueMessage): Promise<void>;
}
