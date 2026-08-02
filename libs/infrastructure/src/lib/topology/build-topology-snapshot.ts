import type {
  ComputeClass,
  EdgeKind,
  NodeHealth,
  TopologyEdge,
  TopologyNode,
  TopologySnapshot,
} from '@track-aws/domain';
import type { InventoryResourceView } from '@track-aws/application';

const MAX_NODES = 160;

const SERVERLESS = new Set([
  'lambda',
  'dynamodb',
  'sqs',
  'sns',
  'ecs-service',
  'stepfunctions',
  'apigateway',
  'api-gateway',
]);

const NON_SERVERLESS = new Set([
  'ec2',
  'rds',
  'rds-cluster',
  'elb',
  'nat',
  'ecs-cluster',
  'elasticache',
]);

const NETWORK = new Set(['vpc', 'subnet', 'sg', 'eip', 'tgw']);
const DATA = new Set(['s3', 'ebs', 'efs', 'glacier']);
const IDENTITY = new Set(['iam-user', 'iam-role']);

const COMPUTE_ATTACH = new Set(['ec2', 'lambda', 'rds', 'rds-cluster', 'elb']);

export function classifyComputeClass(resourceType: string): ComputeClass {
  const t = resourceType.toLowerCase();
  if (SERVERLESS.has(t)) return 'serverless';
  if (NON_SERVERLESS.has(t)) return 'non_serverless';
  if (NETWORK.has(t)) return 'network';
  if (DATA.has(t)) return 'data';
  if (IDENTITY.has(t)) return 'identity';
  return 'other';
}

export function nodeIdForResource(r: InventoryResourceView): string {
  const arn = r.resourceArn?.trim();
  if (arn) return arn;
  return `${r.resourceType}:${r.region || 'global'}:${r.resourceId}`;
}

type FindingRef = {
  findingId: string;
  severity: string;
  resourceArn: string;
  resourceId: string;
};

function healthFor(
  state: string,
  findingIds: string[],
  severities: string[],
): NodeHealth {
  const st = state.toLowerCase();
  if (st === 'stopped' || st === 'terminated') return 'stopped';
  if (severities.some((s) => s === 'CRITICAL')) return 'critical';
  if (severities.some((s) => s === 'HIGH')) return 'degraded';
  if (findingIds.length > 0) return 'degraded';
  if (!state || st === 'unknown') return 'unknown';
  return 'healthy';
}

function shortLabel(r: InventoryResourceView): string {
  const id = r.resourceId || r.resourceType;
  if (id.length <= 28) return id;
  return `${id.slice(0, 12)}…${id.slice(-10)}`;
}

/**
 * Construye TopologySnapshot MVP desde inventario hot + findings del audit.
 * Edges heurísticos (contains / network); sin Athena.
 */
export function buildTopologySnapshot(input: {
  tenantId: string;
  accountId: string;
  auditId: string;
  capturedAtIso: string;
  source?: TopologySnapshot['source'];
  resources: InventoryResourceView[];
  findings: FindingRef[];
}): TopologySnapshot {
  const findingsByArn = new Map<string, FindingRef[]>();
  const findingsByResourceId = new Map<string, FindingRef[]>();
  for (const f of input.findings) {
    if (f.resourceArn) {
      const list = findingsByArn.get(f.resourceArn) ?? [];
      list.push(f);
      findingsByArn.set(f.resourceArn, list);
    }
    if (f.resourceId) {
      const list = findingsByResourceId.get(f.resourceId) ?? [];
      list.push(f);
      findingsByResourceId.set(f.resourceId, list);
    }
  }

  const allNodes: TopologyNode[] = input.resources.map((r) => {
    const id = nodeIdForResource(r);
    const matched = [
      ...(findingsByArn.get(r.resourceArn) ?? []),
      ...(findingsByResourceId.get(r.resourceId) ?? []),
    ];
    const uniq = new Map(matched.map((m) => [m.findingId, m]));
    const refs = [...uniq.values()];
    return {
      id,
      label: shortLabel(r),
      resourceType: r.resourceType,
      computeClass: classifyComputeClass(r.resourceType),
      region: r.region || 'global',
      state: r.state || 'unknown',
      health: healthFor(
        r.state,
        refs.map((x) => x.findingId),
        refs.map((x) => x.severity),
      ),
      estimatedMonthlyCostUsd: r.estimatedMonthlyCostUsd,
      meta: refs.length
        ? { findingIds: refs.map((x) => x.findingId) }
        : undefined,
    };
  });

  const rank = (h: NodeHealth): number => {
    if (h === 'critical') return 0;
    if (h === 'degraded') return 1;
    if (h === 'stopped') return 2;
    if (h === 'unknown') return 3;
    return 4;
  };

  const nodes = [...allNodes]
    .sort(
      (a, b) =>
        rank(a.health) - rank(b.health) ||
        b.estimatedMonthlyCostUsd - a.estimatedMonthlyCostUsd,
    )
    .slice(0, MAX_NODES);

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: TopologyEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (
    source: string,
    target: string,
    kind: EdgeKind,
    label?: string,
  ): void => {
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return;
    const id = `${kind}:${source}→${target}`;
    if (edgeKeys.has(id)) return;
    edgeKeys.add(id);
    edges.push({ id, source, target, kind, label });
  };

  // ECS cluster contains service (resourceId = cluster/service).
  for (const n of nodes) {
    if (n.resourceType !== 'ecs-service') continue;
    const resourceId =
      input.resources.find((r) => nodeIdForResource(r) === n.id)?.resourceId ??
      '';
    const cluster = resourceId.includes('/')
      ? resourceId.split('/')[0]
      : null;
    if (!cluster) continue;
    const clusterNode = nodes.find(
      (c) =>
        c.resourceType === 'ecs-cluster' &&
        c.region === n.region &&
        (c.label === cluster ||
          c.id.endsWith(`/${cluster}`) ||
          c.id.includes(`cluster/${cluster}`) ||
          c.id.includes(`/${cluster}`)),
    );
    if (clusterNode) addEdge(clusterNode.id, n.id, 'contains', 'service');
  }

  // Por región: VPC → SG; SG → compute (cap).
  const regions = [...new Set(nodes.map((n) => n.region))];
  for (const region of regions) {
    const vpcs = nodes.filter((n) => n.resourceType === 'vpc' && n.region === region);
    const sgs = nodes.filter((n) => n.resourceType === 'sg' && n.region === region);
    const compute = nodes.filter(
      (n) => COMPUTE_ATTACH.has(n.resourceType) && n.region === region,
    );

    for (const vpc of vpcs) {
      for (const sg of sgs.slice(0, 12)) {
        addEdge(vpc.id, sg.id, 'contains', 'sg');
      }
    }

    for (const sg of sgs.slice(0, 8)) {
      for (const c of compute.slice(0, 10)) {
        addEdge(sg.id, c.id, 'network');
      }
    }
  }

  let serverlessCount = 0;
  let nonServerlessCount = 0;
  let criticalNodeCount = 0;
  for (const n of nodes) {
    if (n.computeClass === 'serverless') serverlessCount += 1;
    if (n.computeClass === 'non_serverless') nonServerlessCount += 1;
    if (n.health === 'critical') criticalNodeCount += 1;
  }

  return {
    tenantId: input.tenantId,
    accountId: input.accountId,
    auditId: input.auditId,
    asOfIso: input.capturedAtIso,
    capturedAtIso: input.capturedAtIso,
    source: input.source ?? 'derived',
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      serverlessCount,
      nonServerlessCount,
      criticalNodeCount,
    },
    nodes,
    edges,
  };
}
