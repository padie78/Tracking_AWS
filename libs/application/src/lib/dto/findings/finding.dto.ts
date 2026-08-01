import { z } from 'zod';

export const FindingCategorySchema = z.enum([
  'rightsizing',
  'modernization',
  'orphaned',
]);

export const FindingSeveritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);

export const FindingDtoSchema = z.object({
  tenantId: z.string().min(1),
  scanId: z.string().min(1),
  findingId: z.string().min(1),
  category: FindingCategorySchema,
  resourceArn: z.string().min(1),
  resourceId: z.string().min(1),
  region: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  severity: FindingSeveritySchema,
  estimatedMonthlySavingsUsd: z.number().nonnegative(),
  recommendedAction: z.string().min(1),
  createdAtIso: z.string().min(1),
});

export type FindingDto = z.infer<typeof FindingDtoSchema>;
