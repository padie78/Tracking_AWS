import { z } from 'zod';

export const LinkAwsAccountInputSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
  displayName: z.string().min(1).max(128).optional(),
  roleName: z
    .string()
    .min(1)
    .max(64)
    .regex(/^TrackAwsScannerRole([\w+=,.@-]*)?$/)
    .optional(),
  regions: z.array(z.string().min(1)).max(20).optional(),
});

export type LinkAwsAccountInputDto = z.infer<typeof LinkAwsAccountInputSchema>;

export const VerifyAwsAccountLinkInputSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
});

export type VerifyAwsAccountLinkInputDto = z.infer<
  typeof VerifyAwsAccountLinkInputSchema
>;

export const ListAwsAccountsInputSchema = z.object({
  tenantId: z.string().min(1),
});

export type ListAwsAccountsInputDto = z.infer<typeof ListAwsAccountsInputSchema>;
