/** Contratos del grafo semántico (PROYECTO_VISION §E) — MVP sin drift/asOf. */

export type ComputeClass =
  | 'serverless'
  | 'non_serverless'
  | 'network'
  | 'data'
  | 'identity'
  | 'other';

export type NodeHealth =
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'unknown'
  | 'stopped';

export type TopologySource = 'cache' | 'live' | 'derived';

export type EdgeKind =
  | 'network'
  | 'data'
  | 'identity'
  | 'contains'
  | 'depends_on';

export interface TopologyNode {
  id: string;
  label: string;
  resourceType: string;
  computeClass: ComputeClass;
  region: string;
  state: string;
  health: NodeHealth;
  estimatedMonthlyCostUsd: number;
  meta?: {
    findingIds?: string[];
  };
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  bidirectional?: boolean;
}

export interface TopologySummary {
  nodeCount: number;
  edgeCount: number;
  serverlessCount: number;
  nonServerlessCount: number;
  criticalNodeCount: number;
}

export interface TopologySnapshot {
  tenantId: string;
  accountId: string;
  auditId: string;
  /** ISO del audit usado (MVP: capturedAt del escaneo). */
  asOfIso: string;
  capturedAtIso: string;
  source: TopologySource;
  summary: TopologySummary;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
