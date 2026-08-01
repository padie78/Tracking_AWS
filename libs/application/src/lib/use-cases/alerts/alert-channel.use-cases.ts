import { z } from 'zod';
import type { IIdGenerator } from '../../ports/shared/id-generator.port';
import type { ILogger } from '../../ports/shared/logger.port';
import type {
  AlertCategoryFilter,
  AlertChannelKind,
  IAlertChannelRepository,
} from '@track-aws/domain';
import { AlertChannel } from '@track-aws/domain';

const UpsertSchema = z.object({
  tenantId: z.string().min(1),
  channelId: z.string().min(1).optional(),
  kind: z.enum(['webhook', 'slack', 'email']),
  target: z.string().min(3),
  label: z.string().max(120).optional(),
  categories: z
    .array(z.enum(['security', 'savings', 'inconsistency', 'all']))
    .optional(),
});

export class UpsertAlertChannelUseCase {
  constructor(
    private readonly deps: {
      channels: IAlertChannelRepository;
      idGenerator: IIdGenerator;
      logger: ILogger;
    },
  ) {}

  async execute(raw: unknown): Promise<{
    channelId: string;
    kind: AlertChannelKind;
    target: string;
    label: string;
    categories: AlertCategoryFilter[];
    enabled: boolean;
  }> {
    const input = UpsertSchema.parse(raw);
    const channelId = input.channelId ?? this.deps.idGenerator.generate();
    const channel = AlertChannel.create({
      tenantId: input.tenantId,
      channelId,
      kind: input.kind,
      target: input.target,
      label: input.label,
      categories: input.categories as AlertCategoryFilter[] | undefined,
    });
    await this.deps.channels.save(channel);
    this.deps.logger.info('alert_channel_upserted', {
      tenantId: channel.tenantId,
      channelId: channel.channelId,
      kind: channel.kind,
    });
    return {
      channelId: channel.channelId,
      kind: channel.kind,
      target: channel.target,
      label: channel.label,
      categories: channel.categories,
      enabled: channel.enabled,
    };
  }
}

export class ListAlertChannelsUseCase {
  constructor(private readonly channels: IAlertChannelRepository) {}

  async execute(tenantId: string) {
    const list = await this.channels.listByTenant(tenantId);
    return list.map((c) => ({
      channelId: c.channelId,
      kind: c.kind,
      target: c.target,
      label: c.label,
      categories: c.categories,
      enabled: c.enabled,
      createdAtIso: c.createdAtIso,
    }));
  }
}

export class DeleteAlertChannelUseCase {
  constructor(
    private readonly deps: {
      channels: IAlertChannelRepository;
      logger: ILogger;
    },
  ) {}

  async execute(tenantId: string, channelId: string): Promise<{ ok: true }> {
    await this.deps.channels.delete(tenantId, channelId);
    this.deps.logger.info('alert_channel_deleted', { tenantId, channelId });
    return { ok: true };
  }
}
