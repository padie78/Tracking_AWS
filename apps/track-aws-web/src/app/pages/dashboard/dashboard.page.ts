import { DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EChartsCoreOption } from 'echarts/core';
import { AuthService } from '../../core/services/auth.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { AppSyncRealtimeService } from '../../services/appsync-realtime.service';
import {
  AuditFindingView,
  AuditJobView,
  ScanService,
} from '../../services/scan.service';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import {
  gaugeScoreOption,
  savingsBarOption,
  scoreTrendOption,
  severityPieOption,
  wafRadarOption,
} from '../../ui/charts/chart-options';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  encapsulation: ViewEncapsulation.None,
  imports: [DecimalPipe, RouterLink, TaEchartComponent],
  template: `
    <section class="ta-page ta-page--wide">
      <div class="ta-page__head">
        <div>
          <h1>Dashboard</h1>
          <p>Score Well-Architected, ahorro proyectado y severidad del último audit.</p>
        </div>
        <button
          type="button"
          class="ta-btn"
          [disabled]="busy() || !canStartAudit()"
          (click)="startAudit()"
        >
          {{ busy() ? 'Auditando…' : 'Iniciar audit' }}
        </button>
      </div>

      @if (error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <div class="ta-kpi-grid">
        <div class="ta-kpi">
          <div class="ta-kpi__label">Score global</div>
          <div class="ta-kpi__value">{{ score() | number: '1.0-0' }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Ahorro $/mes</div>
          <div class="ta-kpi__value ta-kpi__value--accent">
            {{ savings() | number: '1.0-0' }}
          </div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">CRITICAL</div>
          <div class="ta-kpi__value ta-kpi__value--danger">{{ critical() }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Findings</div>
          <div class="ta-kpi__value">{{ findingCount() }}</div>
        </div>
      </div>

      <div class="ta-chart-grid">
        <div class="ta-card">
          <h2 class="ta-card__title">Score WAF</h2>
          <ta-echart [options]="gaugeOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">Pilares Well-Architected</h2>
          <ta-echart [options]="radarOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">Severidad</h2>
          <ta-echart [options]="pieOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">Top ahorro</h2>
          <ta-echart [options]="barOpt()" height="220px" />
        </div>
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Tendencia de audits</h2>
        <ta-echart [options]="trendOpt()" height="260px" />
      </div>

      <div class="ta-split" style="margin-top:1rem">
        <div class="ta-card">
          <h2 class="ta-card__title">Acción ahora</h2>
          <ul class="ta-action-list">
            @for (f of topActions(); track f.findingId) {
              <li>
                <span class="ta-sev" [attr.data-sev]="f.severity">{{ f.severity }}</span>
                <div>
                  <strong>{{ f.title }}</strong>
                  <div class="ta-meta">{{ f.domain }} · {{ f.resourceId }}</div>
                </div>
              </li>
            } @empty {
              <li class="ta-meta">Sin hallazgos prioritarios. Ejecutá un audit.</li>
            }
          </ul>
          <div class="ta-inline-links">
            <a routerLink="/tabs/secops">SecOps</a>
            <a routerLink="/tabs/finops">FinOps</a>
            <a routerLink="/tabs/architecture">Arquitectura</a>
          </div>
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">Estado</h2>
          <div class="ta-meta">Cuenta: {{ tenant.activeAccountId() ?? '—' }}</div>
          <div class="ta-meta">Realtime: {{ realtime.connectionState() }}</div>
          @if (latest(); as a) {
            <div class="ta-meta">Audit: {{ a.auditId }}</div>
            <div class="ta-meta">Status: {{ a.status }}</div>
          }
          @if (realtime.auditStatus(); as live) {
            <div class="ta-meta">
              Live: {{ live.status }} · score {{ live.globalScore }} · CRITICAL
              {{ live.criticalCount }}
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class DashboardPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantContextService);
  readonly realtime = inject(AppSyncRealtimeService);
  private readonly scanService = inject(ScanService);
  private readonly notes = inject(NotificationService);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly audits = signal<AuditJobView[]>([]);
  readonly findings = signal<AuditFindingView[]>([]);

  readonly latest = computed(() => this.audits()[0] ?? null);

  readonly score = computed(() => {
    const live = this.realtime.auditStatus();
    if (live) return live.globalScore;
    return this.latest()?.globalScore ?? 0;
  });

  readonly savings = computed(() => {
    const live = this.realtime.auditStatus();
    if (live) return live.estimatedMonthlySavingsUsd;
    return this.latest()?.estimatedMonthlySavingsUsd ?? 0;
  });

  readonly critical = computed(() => {
    const live = this.realtime.auditStatus();
    if (live) return live.criticalCount;
    return this.latest()?.criticalCount ?? 0;
  });

  readonly findingCount = computed(() => {
    const live = this.realtime.auditStatus();
    if (live) return live.findingCount;
    return this.latest()?.findingCount ?? this.findings().length;
  });

  readonly gaugeOpt = computed(() => gaugeScoreOption(this.score()));

  readonly radarOpt = computed((): EChartsCoreOption => {
    const p = this.latest()?.pillarScores;
    return wafRadarOption(
      p ?? {
        operationalExcellence: 0,
        security: 0,
        reliability: 0,
        performanceEfficiency: 0,
        costOptimization: 0,
        sustainability: 0,
      },
    );
  });

  readonly pieOpt = computed(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of this.findings()) {
      if (f.severity in counts) {
        counts[f.severity as keyof typeof counts] += 1;
      }
    }
    if (
      Object.values(counts).every((v) => v === 0) &&
      this.latest()
    ) {
      counts.CRITICAL = this.latest()!.criticalCount;
      counts.HIGH = this.latest()!.highCount;
    }
    return severityPieOption(counts);
  });

  readonly barOpt = computed(() =>
    savingsBarOption(
      this.findings()
        .filter((f) => f.estimatedMonthlySavingsUsd > 0)
        .sort(
          (a, b) => b.estimatedMonthlySavingsUsd - a.estimatedMonthlySavingsUsd,
        )
        .map((f) => ({
          name: f.resourceId || f.title.slice(0, 24),
          value: Math.round(f.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  readonly trendOpt = computed(() =>
    scoreTrendOption(
      [...this.audits()]
        .reverse()
        .slice(-8)
        .map((a) => ({
          label: a.auditId.slice(0, 6),
          score: a.globalScore,
          savings: Math.round(a.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  readonly topActions = computed(() => {
    const rank: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };
    return [...this.findings()]
      .sort(
        (a, b) =>
          (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) ||
          b.estimatedMonthlySavingsUsd - a.estimatedMonthlySavingsUsd,
      )
      .slice(0, 5);
  });

  ngOnInit(): void {
    const tenantId = this.auth.tenantId();
    if (tenantId) this.realtime.ensureConnected(tenantId);
    void this.refresh();
  }

  canStartAudit(): boolean {
    return !!this.auth.tenantId() && !!this.tenant.activeAccountId();
  }

  async refresh(): Promise<void> {
    try {
      const list = await this.scanService.listAudits({ limit: 12 });
      this.audits.set(list);
      const latest = list[0];
      if (latest) {
        this.findings.set(await this.scanService.listAuditFindings(latest.auditId));
        const tenantId = this.auth.tenantId();
        if (tenantId) {
          this.realtime.ensureConnected(tenantId, { auditId: latest.auditId });
        }
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  async startAudit(): Promise<void> {
    const accountId = this.tenant.activeAccountId();
    const tenantId = this.auth.tenantId();
    if (!accountId || !tenantId) {
      this.error.set('Seleccioná una cuenta AWS activa.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.scanService.startAudit({ accountId });
      this.realtime.ensureConnected(tenantId, { auditId: result.auditId });
      this.notes.push({
        kind: 'info',
        title: 'Audit iniciado',
        body: `Ejecución ${result.auditId.slice(0, 8)}… en Step Functions`,
        href: '/tabs/audits',
      });
      await this.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
