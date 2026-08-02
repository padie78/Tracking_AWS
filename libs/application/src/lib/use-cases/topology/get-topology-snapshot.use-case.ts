import { z } from 'zod';
import type { TopologySnapshot } from '@track-aws/domain';
import type { IAuditJobReader } from '../../ports/audit/audit-job.port';
import type { IAuditFindingReader } from '../../ports/audit/audit-finding.port';
import type { IAuditInventoryReader } from '../../ports/inventory/inventory.port';

export interface ITopologySnapshotStore {
  findByAudit(tenantId: string, auditId: string): Promise<TopologySnapshot | null>;
  save(snapshot: TopologySnapshot): Promise<void>;
}

export type TopologyBuilderFn = (input: {
  tenantId: string;
  accountId: string;
  auditId: string;
  capturedAtIso: string;
  source: TopologySnapshot['source'];
  resources: Awaited<ReturnType<IAuditInventoryReader['listByAudit']>>;
  findings: Array<{
    findingId: string;
    severity: string;
    resourceArn: string;
    resourceId: string;
  }>;
}) => TopologySnapshot;

const InputSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
  auditId: z.string().min(1).optional(),
});

/**
 * Devuelve topología del audit indicado o del último completed de la cuenta.
 * Si no hay snapshot persistido, lo deriva de inventory+findings y lo cachea.
 */
export class GetTopologySnapshotUseCase {
  constructor(
    private readonly deps: {
      audits: IAuditJobReader;
      inventory: IAuditInventoryReader;
      findings: IAuditFindingReader;
      topology: ITopologySnapshotStore;
      build: TopologyBuilderFn;
    },
  ) {}

  async execute(raw: unknown): Promise<TopologySnapshot | null> {
    const input = InputSchema.parse(raw);
    const audits = await this.deps.audits.listByTenant(input.tenantId, 50);
    const forAccount = audits.filter((a) => a.accountId === input.accountId);

    const focus =
      (input.auditId
        ? forAccount.find((a) => a.auditId === input.auditId)
        : null) ??
      forAccount.find((a) => a.status === 'completed') ??
      forAccount[0] ??
      null;

    if (!focus) return null;

    const cached = await this.deps.topology.findByAudit(
      input.tenantId,
      focus.auditId,
    );
    // Snapshots con labels viejos (ARN): regenerar.
    const labelsLookLikeArn =
      cached?.nodes.some(
        (n) => n.label.startsWith('arn:') || n.label.includes(':aws:'),
      ) ?? false;
    if (cached && cached.edges.length > 0 && !labelsLookLikeArn) {
      return { ...cached, source: 'cache' };
    }

    const [resources, findings] = await Promise.all([
      this.deps.inventory.listByAudit(input.tenantId, focus.auditId),
      this.deps.findings.listByAudit(input.tenantId, focus.auditId),
    ]);

    if (resources.length === 0 && findings.length === 0) return null;

    const snapshot = this.deps.build({
      tenantId: input.tenantId,
      accountId: input.accountId,
      auditId: focus.auditId,
      capturedAtIso:
        focus.completedAtIso ?? focus.createdAtIso ?? new Date().toISOString(),
      source: 'derived',
      resources,
      findings: findings.map((f) => ({
        findingId: f.findingId,
        severity: f.severity,
        resourceArn: f.resourceArn,
        resourceId: f.resourceId,
      })),
    });

    try {
      await this.deps.topology.save(snapshot);
    } catch {
      // Cache miss en siguiente request volverá a derivar.
    }

    return snapshot;
  }
}
