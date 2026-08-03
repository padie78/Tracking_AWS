import { DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import type { EChartsCoreOption } from 'echarts/core';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';
import { AuditProgressComponent } from '../../ui/audit/audit-progress.component';
import { StatusBadgeComponent } from '../../ui/audit/status-badge.component';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import {
  gaugeScoreOption,
  savingsBarOption,
  scoreTrendOption,
  severityPieOption,
  wafRadarOption,
} from '../../ui/charts/chart-options';
import {
  FriendlyFinding,
  humanizeFinding,
  type FindingLike,
} from '../../core/copy/friendly-finding';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DecimalPipe,
    RouterLink,
    ButtonModule,
    TaEchartComponent,
    PageHeaderComponent,
    AuditProgressComponent,
    StatusBadgeComponent,
  ],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Módulo 1"
        title="Resumen general"
        subtitle="Cómo está tu nube hoy: puntuación, ahorro estimado y avisos importantes."
      >
        <button
          pButton
          type="button"
          icon="pi pi-play"
          [label]="audit.starting() ? 'Iniciando…' : audit.isRunning() ? 'Revisando…' : 'Iniciar revisión'"
          [disabled]="audit.starting() || !canStart()"
          (click)="start()"
        ></button>
        <button
          pButton
          type="button"
          class="p-button-outlined"
          icon="pi pi-refresh"
          label="Actualizar"
          (click)="refresh()"
        ></button>
      </ta-page-header>

      @if (audit.error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ audit.error() }}</div>
      }

      <div class="ta-dash-hero">
        <div class="ta-card ta-card--flat">
          <ta-audit-progress
            [stages]="audit.stages()"
            [percent]="audit.progressPercent()"
            [live]="audit.isRunning()"
            [title]="progressTitle()"
            [eyebrow]="progressEyebrow()"
          />
        </div>
        <div class="ta-card">
          <div class="ta-dash-status">
            <div>
              <div class="ta-field__label">Estado</div>
              <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.35rem">
                <ta-status-badge [status]="audit.displayStatus()" />
                <span class="ta-meta">{{ audit.connectionState() }}</span>
              </div>
            </div>
            <div>
              <div class="ta-field__label">Cuenta</div>
              <div class="ta-meta" style="margin-top:0.35rem">
                {{ tenant.activeAccountId() ?? 'Sin cuenta activa' }}
              </div>
            </div>
            @if (audit.activeAudit(); as a) {
              <div>
                <div class="ta-field__label">Audit</div>
                <div class="ta-meta" style="margin-top:0.35rem;word-break:break-all">
                  {{ a.auditId }}
                </div>
              </div>
            }
            <a class="ta-link" routerLink="/tabs/audits">Ver historial →</a>
          </div>
        </div>
      </div>

      <div class="ta-kpi-grid" style="margin-top:1rem">
        <div class="ta-kpi">
          <div class="ta-kpi__label">Puntuación general</div>
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
          <h2 class="ta-card__title">Puntuación de seguridad</h2>
          <ta-echart [options]="gaugeOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">Áreas de buenas prácticas</h2>
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
        <h2 class="ta-card__title">Tendencia de las últimas revisiones</h2>
        <ta-echart [options]="trendOpt()" height="260px" />
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Qué conviene hacer ahora</h2>
        <ul class="ta-action-list">
          @for (f of topActions(); track f.findingId) {
            <li>
              <span class="ta-sev" [attr.data-sev]="f.severity">{{ friendly(f).urgencyLabel }}</span>
              <div>
                <strong>{{ friendly(f).headline }}</strong>
                <div class="ta-meta">{{ friendly(f).areaLabel }} · {{ friendly(f).where }}</div>
              </div>
            </li>
          } @empty {
            <li class="ta-meta">Sin hallazgos prioritarios. Iniciá una revisión.</li>
          }
        </ul>
        <div class="ta-inline-links">
          <a routerLink="/tabs/secops">Seguridad</a>
          <a routerLink="/tabs/finops">Costos</a>
          <a routerLink="/tabs/inventory">Inventario</a>
          <a routerLink="/tabs/compliance">Cumplimiento</a>
          <a routerLink="/tabs/playbooks">Acciones</a>
        </div>
      </div>
    </section>
  `,
})
export class DashboardPageComponent implements OnInit {
  readonly tenant = inject(TenantContextService);
  readonly audit = inject(AuditLiveService);

  readonly score = computed(() => {
    const live = this.audit.liveStatus();
    if (live) return live.globalScore;
    return this.audit.activeAudit()?.globalScore ?? 0;
  });

  readonly savings = computed(() => {
    const live = this.audit.liveStatus();
    if (live) return live.estimatedMonthlySavingsUsd;
    return this.audit.activeAudit()?.estimatedMonthlySavingsUsd ?? 0;
  });

  readonly critical = computed(() => {
    const live = this.audit.liveStatus();
    if (live) return live.criticalCount;
    return this.audit.activeAudit()?.criticalCount ?? 0;
  });

  readonly findingCount = computed(() => {
    const live = this.audit.liveStatus();
    if (live) return live.findingCount;
    return this.audit.activeAudit()?.findingCount ?? this.audit.findings().length;
  });

  readonly gaugeOpt = computed(() => gaugeScoreOption(this.score()));

  readonly radarOpt = computed((): EChartsCoreOption => {
    const p = this.audit.activeAudit()?.pillarScores;
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
    for (const f of this.audit.findings()) {
      if (f.severity in counts) counts[f.severity as keyof typeof counts] += 1;
    }
    const latest = this.audit.activeAudit();
    if (Object.values(counts).every((v) => v === 0) && latest) {
      counts.CRITICAL = latest.criticalCount;
      counts.HIGH = latest.highCount;
    }
    return severityPieOption(counts);
  });

  readonly barOpt = computed(() =>
    savingsBarOption(
      this.audit
        .findings()
        .filter((f) => f.estimatedMonthlySavingsUsd > 0)
        .sort((a, b) => b.estimatedMonthlySavingsUsd - a.estimatedMonthlySavingsUsd)
        .map((f) => ({
          name: f.resourceId || f.title.slice(0, 24),
          value: Math.round(f.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  readonly trendOpt = computed(() =>
    scoreTrendOption(
      [...this.audit.audits()]
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
    return [...this.audit.findings()]
      .sort(
        (a, b) =>
          (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) ||
          b.estimatedMonthlySavingsUsd - a.estimatedMonthlySavingsUsd,
      )
      .slice(0, 5);
  });

  friendly(f: FindingLike): FriendlyFinding {
    return humanizeFinding(f);
  }

  ngOnInit(): void {
    void this.audit.bootstrap();
  }

  canStart(): boolean {
    return !!this.tenant.activeAccountId() && !this.audit.isRunning();
  }

  progressTitle(): string {
    if (this.audit.isRunning()) return 'Revisión en curso';
    if (this.audit.displayStatus() === 'completed') return 'Última revisión completada';
    if (this.audit.displayStatus() === 'failed') return 'La última revisión falló';
    return 'Listo para revisar';
  }

  progressEyebrow(): string {
    return this.audit.isRunning() ? 'En vivo' : 'Progreso';
  }

  async start(): Promise<void> {
    await this.audit.startAudit();
  }

  async refresh(): Promise<void> {
    await this.audit.refreshAudits();
  }
}
