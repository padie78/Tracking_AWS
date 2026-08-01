import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface DynamoClientOptions {
  region?: string;
  endpoint?: string;
}

let documentClient: DynamoDBDocumentClient | undefined;

export function getDocumentClient(
  options: DynamoClientOptions = {},
): DynamoDBDocumentClient {
  if (documentClient) return documentClient;
  const base = new DynamoDBClient({
    region: options.region ?? process.env['AWS_REGION'] ?? 'eu-central-1',
    endpoint: options.endpoint ?? process.env['DYNAMODB_ENDPOINT'],
  });
  documentClient = DynamoDBDocumentClient.from(base, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertEmptyValues: false,
    },
  });
  return documentClient;
}
