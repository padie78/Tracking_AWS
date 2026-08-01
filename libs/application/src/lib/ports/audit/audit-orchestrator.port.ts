export interface AuditOrchestrationInput {
  tenantId: string;
  auditId: string;
  accountId: string;
  correlationId: string;
  regions?: string[];
}

export interface IAuditOrchestrator {
  start(input: AuditOrchestrationInput): Promise<{ executionArn: string }>;
}
