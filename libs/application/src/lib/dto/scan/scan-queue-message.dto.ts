import { z } from 'zod';

export const ScanQueueMessageSchema = z.object({
  tenantId: z.string().min(1),
  scanId: z.string().min(1),
  accountId: z.string().min(1),
  roleArn: z.string().min(1),
  externalId: z.string().min(1),
  regions: z.array(z.string().min(1)).default([]),
  correlationId: z.string().min(1),
});

export type ScanQueueMessageDto = z.infer<typeof ScanQueueMessageSchema>;

export const EnqueueInventoryScanInputSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
  regions: z.array(z.string().min(1)).max(20).optional(),
});

export type EnqueueInventoryScanInputDto = z.infer<
  typeof EnqueueInventoryScanInputSchema
>;

export const AnalyzerQueueMessageSchema = z.object({
  tenantId: z.string().min(1),
  scanId: z.string().min(1),
  accountId: z.string().min(1),
  correlationId: z.string().min(1),
  inventoryPayload: z.unknown(),
});

export type AnalyzerQueueMessageDto = z.infer<typeof AnalyzerQueueMessageSchema>;
