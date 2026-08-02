import {
  Component,
  ViewEncapsulation,
  computed,
  input,
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

/** health → semáforo producto GREEN / YELLOW / RED */
function healthColor(health: string): string {
  switch (health) {
    case 'critical':
      return '#dc2626'; // RED
    case 'degraded':
      return '#ca8a04'; // YELLOW
    case 'healthy':
      return '#16a34a'; // GREEN
    case 'stopped':
      return '#64748b';
    default:
      return '#94a3b8';
  }
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

@Component({
  standalone: true,
  selector: 'ta-topology-graph',
  encapsulation: ViewEncapsulation.None,
  imports: [TaEchartComponent],
  template: `
    <div class="ta-topo">
      <div class="ta-topo__legend">
        <span><i data-h="healthy"></i> GREEN</span>
        <span><i data-h="degraded"></i> YELLOW</span>
        <span><i data-h="critical"></i> RED</span>
        <span class="ta-meta">Serverless vs No Serverless por categoría</span>
      </div>
      <ta-echart [options]="options()" height="420px" />
    </div>
  `,
  styles: [
    `
      .ta-topo__legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.85rem;
        align-items: center;
        margin-bottom: 0.65rem;
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

    const categories = [
      { name: 'Serverless' },
      { name: 'No Serverless' },
      { name: 'Network' },
      { name: 'Data' },
      { name: 'Identity' },
      { name: 'Other' },
    ];

    return {
      tooltip: {
        formatter: (p: unknown) => {
          const raw = p as {
            dataType?: string;
            data?: TopologyNodeView & { name?: string };
          };
          if (raw.dataType !== 'node' || !raw.data) return '';
          const n = raw.data;
          return [
            `<strong>${n.label}</strong>`,
            `${n.resourceType} · ${n.computeClass}`,
            `${n.region} · ${n.state}`,
            `health: ${n.health}`,
            `~$${Math.round(n.estimatedMonthlyCostUsd)}/mes`,
          ].join('<br/>');
        },
      },
      legend: [{ data: categories.map((c) => c.name), bottom: 0 }],
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          categories,
          label: {
            show: true,
            position: 'right',
            formatter: '{b}',
            fontSize: 10,
          },
          force: {
            repulsion: 180,
            edgeLength: [40, 120],
            gravity: 0.08,
          },
          data: snap.nodes.map((n) => ({
            ...n,
            name: n.label,
            category: categoryIndex(n.computeClass),
            symbolSize: Math.max(
              14,
              Math.min(36, 12 + Math.sqrt(n.estimatedMonthlyCostUsd || 1)),
            ),
            itemStyle: { color: healthColor(n.health) },
          })),
          links: snap.edges.map((e) => ({
            source: snap.nodes.findIndex((n) => n.id === e.source),
            target: snap.nodes.findIndex((n) => n.id === e.target),
            value: e.kind,
            lineStyle: { curveness: 0.12, opacity: 0.45 },
          })).filter((l) => l.source >= 0 && l.target >= 0),
          lineStyle: { color: '#94a3b8', width: 1 },
          emphasis: { focus: 'adjacency' },
        },
      ],
    };
  });
}
