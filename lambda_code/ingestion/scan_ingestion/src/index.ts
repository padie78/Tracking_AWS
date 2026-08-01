import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ZodError } from 'zod';
import { buildEnqueueInventoryScanUseCase } from './composition-root';

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function validateIngestionSecret(
  headers: Record<string, string | undefined>,
): boolean {
  const expected = process.env['SCAN_INGESTION_SECRET'];
  if (!expected) return true;
  return headers['x-scan-secret'] === expected;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const useCase = buildEnqueueInventoryScanUseCase();

  const headers = Object.fromEntries(
    Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  if (!validateIngestionSecret(headers)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let payload: unknown;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  try {
    const result = await useCase.execute(payload);
    return jsonResponse(202, {
      accepted: true,
      scanId: result.scanId,
      correlationId: result.correlationId,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonResponse(400, {
        error: 'Payload inválido',
        details: error.flatten(),
      });
    }
    throw error;
  }
};
