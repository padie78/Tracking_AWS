import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type {
  AnalyzerQueueMessage,
  DossierQueueMessage,
  IDossierQueuePublisher,
  IModernizationQueuePublisher,
  IOrphanedQueuePublisher,
  IRightsizingQueuePublisher,
  IScanQueuePublisher,
  ScanQueueMessage,
} from '@track-aws/application';

function requireQueueUrl(envKey: string): string {
  const url = process.env[envKey];
  if (!url) throw new Error(`Missing env ${envKey}`);
  return url;
}

let sqsClient: SQSClient | undefined;

function getSqsClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: process.env['AWS_REGION'] ?? 'eu-central-1',
    });
  }
  return sqsClient;
}

async function sendJson(queueUrl: string, body: unknown): Promise<void> {
  await getSqsClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    }),
  );
}

export class SqsScanQueuePublisherAdapter implements IScanQueuePublisher {
  constructor(private readonly queueUrl = requireQueueUrl('SCAN_QUEUE_URL')) {}

  enqueue(message: ScanQueueMessage): Promise<void> {
    return sendJson(this.queueUrl, message);
  }
}

export class SqsRightsizingQueuePublisherAdapter
  implements IRightsizingQueuePublisher
{
  constructor(
    private readonly queueUrl = requireQueueUrl('RIGHTSIZING_QUEUE_URL'),
  ) {}

  enqueue(message: AnalyzerQueueMessage): Promise<void> {
    return sendJson(this.queueUrl, message);
  }
}

export class SqsModernizationQueuePublisherAdapter
  implements IModernizationQueuePublisher
{
  constructor(
    private readonly queueUrl = requireQueueUrl('MODERNIZATION_QUEUE_URL'),
  ) {}

  enqueue(message: AnalyzerQueueMessage): Promise<void> {
    return sendJson(this.queueUrl, message);
  }
}

export class SqsOrphanedQueuePublisherAdapter implements IOrphanedQueuePublisher {
  constructor(
    private readonly queueUrl = requireQueueUrl('ORPHANED_QUEUE_URL'),
  ) {}

  enqueue(message: AnalyzerQueueMessage): Promise<void> {
    return sendJson(this.queueUrl, message);
  }
}

export class SqsDossierQueuePublisherAdapter implements IDossierQueuePublisher {
  constructor(
    private readonly queueUrl = requireQueueUrl('DOSSIER_QUEUE_URL'),
  ) {}

  enqueue(message: DossierQueueMessage): Promise<void> {
    return sendJson(this.queueUrl, message);
  }
}
