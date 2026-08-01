import { DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AuditFindingView,
  AuditJobView,
  ScanService,
} from '../../services/scan.service';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import { severityPieOption, wafRadarOption } from '../../ui/charts/chart-options';

@Component({
  standalone: true,
  selector: 'app-architecture-page',
  encapsulation: ViewEncapsulation.None,
  imports: [DecimalPipe, TaEchartComponent],
  template: `
    <section class="ta-page ta-page--wide">
      <div class="ta-page__head">
        <div>
          <h1>Arquitectura</h1>
          <p>Pilares Well-Architected e inconsistencias detectadas en el último audit.</p>
        </div>
        <button type="button" class="ta-btn ta-btn--ghost" [disabled]="busy()" (click)="refresh()">
          {{ busy() ? 'Cargando…' : 'Actualizar' }}
        </button>
      </div>

      @if (error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <div class="ta-kpi-grid">
        <div class="ta-kpi">
          <div class="ta-kpi__label">Score global</div>
          <div class="ta-kpi__value">{{ (audit()?.globalScore ?? 0) | number: '1.0-0' }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Inconsistencias</div>
          <div class="ta-kpi__value">{{ findings().length }}</div>
        </div>
      </div>

      <div class="ta-chart-grid" style="margin-top:1rem">
        <div class="ta-card">
          <h2 class="ta-card__title">Radar WAF</h2>
          <ta-echart [options]="radarOpt()" height="280px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">Severidad</h2>
          <ta-echart [options]="pieOpt()" height="280px" />
        </div>
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Hallazgos de arquitectura</h2>
        <ul class="ta-finding-list">
          @for (f of findings(); track f.findingId) {
            <li>
              <span class="ta-sev" [attr.data-sev]="f.severity">{{ f.severity }}</span>
              <div>
                <strong>{{ f.title }}</strong>
                <div class="ta-meta">{{ f.category }} · {{ f.resourceId }}</div>
                <div class="ta-meta">{{ f.recommendedAction }}</div>
              </div>
            </li>
          } @empty {
            <li class="ta-meta">
              Sin findings de arquitectura. Los pilares se calculan en aggregate-audit.
            </li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class ArchitecturePageComponent implements OnInit {
  private readonly scanService = inject(ScanService);

  readonly audit = signal<AuditJobView | null>(null);
  readonly findings = signal<AuditFindingView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly radarOpt = computed(() => {
    const p = this.audit()?.pillarScores;
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
      if (f.severity in counts) counts[f.severity as keyof typeof counts] += 1;
    }
    return severityPieOption(counts);
  });

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const list = await this.scanService.listAudits({ limit: 1 });
      const latest = list[0] ?? null;
      this.audit.set(latest);
      if (!latest) {
        this.findings.set([]);
        return;
      }
      this.findings.set(
        await this.scanService.listAuditFindings(latest.auditId, 'architecture'),
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
