import {
  SFNClient,
  StartExecutionCommand,
} from '@aws-sdk/client-sfn';
import type {
  AuditOrchestrationInput,
  IAuditOrchestrator,
} from '@track-aws/application';

export class StepFunctionsAuditOrchestratorAdapter
  implements IAuditOrchestrator
{
  private readonly client = new SFNClient({});

  async start(
    input: AuditOrchestrationInput,
  ): Promise<{ executionArn: string }> {
    const stateMachineArn = process.env['AUDIT_STATE_MACHINE_ARN'];
    if (!stateMachineArn) {
      throw new Error('Missing env AUDIT_STATE_MACHINE_ARN');
    }

    const result = await this.client.send(
      new StartExecutionCommand({
        stateMachineArn,
        name: `${input.auditId}`.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 80),
        input: JSON.stringify({
          tenantId: input.tenantId,
          auditId: input.auditId,
          accountId: input.accountId,
          correlationId: input.correlationId,
          regions: input.regions ?? [],
        }),
      }),
    );

    if (!result.executionArn) {
      throw new Error('Step Functions no devolvió executionArn');
    }
    return { executionArn: result.executionArn };
  }
}
