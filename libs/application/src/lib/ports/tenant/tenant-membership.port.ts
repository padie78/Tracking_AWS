import type { UserRoleValue } from '@track-aws/domain';

export interface TenantMemberView {
  tenantId: string;
  userId: string;
  email: string;
  role: UserRoleValue;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface TenantProfileView {
  tenantId: string;
  name: string;
  plan: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ITenantMemberReader {
  findByUser(tenantId: string, userId: string): Promise<TenantMemberView | null>;
}

export interface ITenantMemberWriter {
  save(member: TenantMemberView): Promise<void>;
}

export interface ITenantProfileReader {
  findByTenant(tenantId: string): Promise<TenantProfileView | null>;
}

export interface ITenantProfileWriter {
  saveIfAbsent(profile: TenantProfileView): Promise<boolean>;
}
