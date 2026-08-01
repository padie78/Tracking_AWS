import { z } from 'zod';

export const StartAuditInputSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
  regions: z.array(z.string().min(1)).max(20).optional(),
});

export type StartAuditInputDto = z.infer<typeof StartAuditInputSchema>;

export const AuditPayloadSchema = z.object({
  tenantId: z.string().min(1),
  auditId: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
  roleArn: z.string().min(1),
  externalId: z.string().min(1),
  regions: z.array(z.string().min(1)),
  correlationId: z.string().min(1),
});

export type AuditPayloadDto = z.infer<typeof AuditPayloadSchema>;
