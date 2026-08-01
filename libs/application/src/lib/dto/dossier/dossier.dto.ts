import { z } from 'zod';

export const DossierQueueMessageSchema = z.object({
  tenantId: z.string().min(1),
  scanId: z.string().min(1),
  accountId: z.string().min(1),
  correlationId: z.string().min(1),
});

export type DossierQueueMessageDto = z.infer<typeof DossierQueueMessageSchema>;

export const GenerateDossierInputSchema = z.object({
  tenantId: z.string().min(1),
  scanId: z.string().min(1),
  accountId: z.string().min(1),
  roleTone: z.enum(['finops_admin', 'analyst', 'viewer']).default('analyst'),
});

export type GenerateDossierInputDto = z.infer<typeof GenerateDossierInputSchema>;
