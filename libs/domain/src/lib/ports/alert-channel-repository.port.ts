import type { AlertChannel } from '../entities/alert-channel';

export interface IAlertChannelRepository {
  save(channel: AlertChannel): Promise<void>;
  delete(tenantId: string, channelId: string): Promise<void>;
  listByTenant(tenantId: string): Promise<AlertChannel[]>;
}
