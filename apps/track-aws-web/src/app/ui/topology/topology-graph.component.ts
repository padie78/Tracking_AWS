import {
  Component,
  ViewEncapsulation,
  computed,
  input,
  signal,
} from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { TaEchartComponent } from '../charts/ta-echart.component';

export interface TopologyNodeView {
  id: string;
  label: string;
  resourceType: string;
  computeClass: string;
  region: string;
  state: string;
  health: string;
  estimatedMonthlyCostUsd: number;
}

export interface TopologyEdgeView {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string | null;
}

export interface TopologySnapshotView {
  auditId: string;
  accountId: string;
  capturedAtIso: string;
  source: string;
  summary: {
    nodeCount: number;
    edgeCount: number;
    serverlessCount: number;
    nonServerlessCount: number;
    criticalNodeCount: number;
  };
  nodes: TopologyNodeView[];
  edges: TopologyEdgeView[];
}

export type TopologyViewMode = 'overview' | 'risks' | 'detail';

const STRUCTURAL = new Set(['vpc', 'sg', 'ecs-cluster', 'elb', 'nat']);

function healthColor(health: string): string {
  switch (health) {
    case 'critical':
      return '#dc2626';
    case 'degraded':
      return '#ca8a04';
    case 'healthy':
      return '#16a34a';
    case 'stopped':
      return '#64748b';
    default:
      return '#94a3b8';
  }
}

function healthRank(h: string): number {
  if (h === 'critical') return 0;
  if (h === 'degraded') return 1;
  if (h === 'stopped') return 2;
  if (h === 'unknown') return 3;
  return 4;
}

function worstHealth(a: string, b: string): string {
  return healthRank(a) <= healthRank(b) ? a : b;
}

function categoryIndex(computeClass: string): number {
  switch (computeClass) {
    case 'serverless':
      return 0;
    case 'non_serverless':
      return 1;
    case 'network':
      return 2;
    case 'data':
      return 3;
    case 'identity':
      return 4;
    default:
      return 5;
  }
}

function categoryName(computeClass: string): string {
  switch (computeClass) {
    case 'serverless':
      return 'Serverless';
    case 'non_serverless':
      return 'No Serverless';
    case 'network':
      return 'Network';
    case 'data':
      return 'Data';
    case 'identity':
      return 'Identity';
    default:
      return 'Other';
  }
}

/** Agrupa por tipo → pocos nodos legibles. */
function buildOverview(snap: TopologySnapshotView): {
  nodes: TopologyNodeView[];
  edges: TopologyEdgeView[];
} {
  const groups = new Map<
    string,
    {
      type: string;
      computeClass: string;
      count: number;
      health: string;
      cost: number;
      memberIds: Set<string>;
    }
  >();

  for (const n of snap.nodes) {
    const key = `${n.computeClass}::${n.resourceType}`;
    const g = groups.get(key) ?? {
      type: n.resourceType,
      computeClass: n.computeClass,
      count: 0,
      health: 'healthy',
      cost: 0,
      memberIds: new Set<string>(),
    };
    g.count += 1;
    g.health = worstHealth(g.health, n.health);
    g.cost += n.estimatedMonthlyCostUsd || 0;
    g.memberIds.add(n.id);
    groups.set(key, g);
  }

  const nodes: TopologyNodeView[] = [...groups.entries()].map(([key, g]) => ({
    id: `agg:${key}`,
    label: `${g.type} ×${g.count}`,
    resourceType: g.type,
    computeClass: g.computeClass,
    region: 'multi',
    state: 'aggregate',
    health: g.health,
    estimatedMonthlyCostUsd: Math.round(g.cost),
  }));

  const idToAgg = new Map<string, string>();
  for (const [key, g] of groups) {
    for (const mid of g.memberIds) idToAgg.set(mid, `agg:${key}`);
  }

  const edgeBag = new Map<string, TopologyEdgeView>();
  for (const e of snap.edges) {
    const s = idToAgg.get(e.source);
    const t = idToAgg.get(e.target);
    if (!s || !t || s === t) continue;
    // En overview solo contains/network (menos ruido).
    if (e.kind !== 'contains' && e.kind !== 'network') continue;
    const id = `${e.kind}:${s}→${t}`;
    if (edgeBag.has(id)) continue;
    edgeBag.set(id, {
      id,
      source: s,
      target: t,
      kind: e.kind,
      label: e.label || e.kind,
    });
  }

  return { nodes, edges: [...edgeBag.values()] };
}

/** Solo riesgos + anclas de red. */
function buildRisks(snap: TopologySnapshotView): {
  nodes: TopologyNodeView[];
  edges: TopologyEdgeView[];
} {
  const anchors = snap.nodes.filter((n) => STRUCTURAL.has(n.resourceType));
  const risks = snap.nodes
    .filter((n) => n.health === 'critical' || n.health === 'degraded')
    .sort(
      (a, b) =>
        healthRank(a.health) - healthRank(b.health) ||
        b.estimatedMonthlyCostUsd - a.estimatedMonthlyCostUsd,
    )
    .slice(0, 18);

  const selected = new Map<string, TopologyNodeView>();
  for (const n of [...anchors.slice(0, 10), ...risks]) {
    selected.set(n.id, n);
  }

  // Limitar a 28 nodos totales.
  const nodes = [...selected.values()].slice(0, 28);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = snap.edges
    .filter(
      (e) =>
        ids.has(e.source) &&
        ids.has(e.target) &&
        (e.kind === 'contains' || e.kind === 'network' || e.kind === 'depends_on'),
    )
    .slice(0, 40);

  return { nodes, edges };
}

/** Detalle acotado: top por salud/costo + estructurales. */
function buildDetail(snap: TopologySnapshotView): {
  nodes: TopologyNodeView[];
  edges: TopologyEdgeView[];
} {
  const structural = snap.nodes.filter((n) => STRUCTURAL.has(n.resourceType));
  const rest = snap.nodes
    .filter((n) => !STRUCTURAL.has(n.resourceType))
    .sort(
      (a, b) =>
        healthRank(a.health) - healthRank(b.health) ||
        b.estimatedMonthlyCostUsd - a.estimatedMonthlyCostUsd,
    );

  const selected = new Map<string, TopologyNodeView>();
  for (const n of structural.slice(0, 12)) selected.set(n.id, n);
  for (const n of rest) {
    if (selected.size >= 36) break;
    selected.set(n.id, n);
  }
  const nodes = [...selected.values()];
  const ids = new Set(nodes.map((n) => n.id));
  const edges = snap.edges
    .filter(
      (e) =>
        ids.has(e.source) &&
        ids.has(e.target) &&
        (e.kind === 'contains' || e.kind === 'network'),
    )
    .slice(0, 50);
  return { nodes, edges };
}

@Component({
  standalone: true,
  selector: 'ta-topology-graph',
  encapsulation: ViewEncapsulation.None,
  imports: [TaEchartComponent],
  template: `
    <div class="ta-topo">
      <div class="ta-topo__toolbar">
        <div class="ta-topo__modes">
          <button
            type="button"
            class="ta-btn ta-btn--sm"
            [class.ta-btn--ghost]="mode() !== 'overview'"
            (click)="mode.set('overview')"
          >
            Resumen
          </button>
          <button
            type="button"
            class="ta-btn ta-btn--sm"
            [class.ta-btn--ghost]="mode() !== 'risks'"
            (click)="mode.set('risks')"
          >
            Riesgos
          </button>
          <button
            type="button"
            class="ta-btn ta-btn--sm"
            [class.ta-btn--ghost]="mode() !== 'detail'"
            (click)="mode.set('detail')"
          >
            Detalle
          </button>
        </div>
        <div class="ta-topo__legend">
          <span><i data-h="healthy"></i> GREEN</span>
          <span><i data-h="degraded"></i> YELLOW</span>
          <span><i data-h="critical"></i> RED</span>
          <span class="ta-meta">{{ hint() }}</span>
        </div>
      </div>
      <ta-echart [options]="options()" height="380px" />
    </div>
  `,
  styles: [
    `
      .ta-topo__toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.25rem;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.65rem;
      }
      .ta-topo__modes {
        display: flex;
        gap: 0.35rem;
      }
      .ta-topo__legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        font-size: 0.8rem;
      }
      .ta-topo__legend i {
        display: inline-block;
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 50%;
        margin-right: 0.3rem;
        vertical-align: middle;
      }
      .ta-topo__legend i[data-h='healthy'] {
        background: #16a34a;
      }
      .ta-topo__legend i[data-h='degraded'] {
        background: #ca8a04;
      }
      .ta-topo__legend i[data-h='critical'] {
        background: #dc2626;
      }
    `,
  ],
})
export class TopologyGraphComponent {
  readonly snapshot = input<TopologySnapshotView | null>(null);
  readonly mode = signal<TopologyViewMode>('overview');

  readonly hint = computed(() => {
    switch (this.mode()) {
      case 'overview':
        return 'Nodos = tipo de recurso agregado';
      case 'risks':
        return 'Solo RED/YELLOW + red ancla';
      default:
        return 'Hasta ~36 recursos individuales';
    }
  });

  readonly options = computed((): EChartsCoreOption => {
    const snap = this.snapshot();
    if (!snap || snap.nodes.length === 0) {
      return {
        title: {
          text: 'Sin topología para este audit',
          left: 'center',
          top: 'center',
          textStyle: { color: '#64748b', fontSize: 14 },
        },
      };
    }

    const view =
      this.mode() === 'overview'
        ? buildOverview(snap)
        : this.mode() === 'risks'
          ? buildRisks(snap)
          : buildDetail(snap);

    if (view.nodes.length === 0) {
      return {
        title: {
          text: 'Sin nodos en esta vista',
          left: 'center',
          top: 'center',
          textStyle: { color: '#64748b', fontSize: 14 },
        },
      };
    }

    const categories = [
      { name: 'Serverless' },
      { name: 'No Serverless' },
      { name: 'Network' },
      { name: 'Data' },
      { name: 'Identity' },
      { name: 'Other' },
    ];

    const useCircular = this.mode() === 'overview' || view.nodes.length <= 24;

    return {
      tooltip: {
        formatter: (p: unknown) => {
          const raw = p as {
            dataType?: string;
            data?: TopologyNodeView & { name?: string; value?: string };
          };
          if (raw.dataType === 'edge') {
            const e = raw.data as { value?: string };
            return e?.value ? `relación: <strong>${e.value}</strong>` : 'relación';
          }
          if (raw.dataType !== 'node' || !raw.data) return '';
          const n = raw.data;
          return [
            `<strong>${n.label}</strong>`,
            `${n.resourceType} · ${categoryName(n.computeClass)}`,
            n.region !== 'multi' ? `${n.region} · ${n.state}` : 'agregado',
            `salud: ${n.health}`,
            `~$${Math.round(n.estimatedMonthlyCostUsd)}/mes`,
          ].join('<br/>');
        },
      },
      legend: [{ data: categories.map((c) => c.name), bottom: 0 }],
      series: [
        {
          type: 'graph',
          layout: useCircular ? 'circular' : 'force',
          circular: useCircular ? { rotateLabel: true } : undefined,
          roam: true,
          draggable: true,
          categories,
          label: {
            show: true,
            position: 'right',
            formatter: '{b}',
            fontSize: this.mode() === 'overview' ? 11 : 10,
          },
          edgeLabel: {
            show: this.mode() !== 'detail',
            fontSize: 9,
            color: '#64748b',
            formatter: (params: unknown) => {
              const p = params as { data?: { value?: string } };
              return p.data?.value ?? '';
            },
          },
          force: useCircular
            ? undefined
            : {
                repulsion: 320,
                edgeLength: [80, 160],
                gravity: 0.12,
              },
          data: view.nodes.map((n) => ({
            id: n.id,
            name: n.label,
            category: categoryIndex(n.computeClass),
            symbolSize: Math.max(
              18,
              Math.min(
                this.mode() === 'overview' ? 44 : 32,
                16 + Math.sqrt(Math.max(n.estimatedMonthlyCostUsd, n.label.includes('×') ? 40 : 1)),
              ),
            ),
            itemStyle: { color: healthColor(n.health) },
            label: n.label,
            resourceType: n.resourceType,
            computeClass: n.computeClass,
            region: n.region,
            state: n.state,
            health: n.health,
            estimatedMonthlyCostUsd: n.estimatedMonthlyCostUsd,
          })),
          links: view.edges.map((e) => ({
            source: e.source,
            target: e.target,
            value: e.label || e.kind,
            lineStyle: {
              curveness: useCircular ? 0.2 : 0.12,
              opacity: 0.55,
              width: 1.4,
              color:
                e.kind === 'network'
                  ? '#0d9488'
                  : e.kind === 'contains'
                    ? '#64748b'
                    : '#94a3b8',
            },
          })),
          lineStyle: { color: '#94a3b8', width: 1.2 },
          emphasis: { focus: 'adjacency', lineStyle: { width: 2.5 } },
        },
      ],
    };
  });
}
