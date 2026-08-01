import type { SQSBatchResponse, SQSHandler } from 'aws-lambda';
import { buildProcessInventoryScanUseCase } from './composition-root';

export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
  const useCase = buildProcessInventoryScanUseCase();
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const raw: unknown = JSON.parse(record.body);
      await useCase.execute(raw);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'ERROR',
          message: 'Error procesando scan SQS',
          messageId: record.messageId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
