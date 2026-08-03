import { DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import { savingsBarOption, severityPieOption } from '../../ui/charts/chart-options';

type FinopsTab = 'all' | 'rightsizing' | 'modernization' | 'orphaned';

@Component({
  standalone: true,
  selector: 'app-finops-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DecimalPipe,
    FormsModule,
    ButtonModule,
    SelectButtonModule,
    PageHeaderComponent,
    TaEchartComponent,
    RouterLink,
  ],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Módulo 4"
        title="Control de gastos"
        subtitle="Recursos caros o sin uso, oportunidades de ahorro y avisos si el gasto se desvía."
      >
        <button
          pButton
          type="button"
          class="p-button-outlined"
          icon="pi pi-refresh"
          [label]="busy() ? 'Cargando…' : 'Actualizar'"
          [disabled]="busy()"
          (click)="refresh()"
        ></button>
      </ta-page-header>

      @if (error()) {
        <div class="ta-error">{{ error() }}</div>
      }

      @if (audit.activeAudit(); as a) {
        <div class="ta-meta">
          Revisión <code>{{ a.auditId.slice(0, 8) }}…</code>
          · {{ a.status }} · {{ a.findingCount }} hallazgos · cuenta
          {{ a.accountId }}
          ·
          <a class="ta-link" routerLink="/tabs/audits">cambiar en Historial</a>
        </div>
      }

      <p-selectButton
        [options]="tabs"
        [(ngModel)]="tabModel"
        optionLabel="label"
        optionValue="id"
        [style]="{ width: '100%' }"
        (ngModelChange)="tab.set($event)"
      />

      <div class="ta-kpi-grid" style="margin-top:1rem">
        <div class="ta-kpi">
          <div class="ta-kpi__label">Ahorro filtrado $/mes</div>
          <div class="ta-kpi__value ta-kpi__value--accent">
            {{ filteredSavings() | number: '1.0-0' }}
          </div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Oportunidades de ahorro</div>
          <div class="ta-kpi__value">{{ filtered().length }}</div>
        </div>
      </div>

      <div class="ta-chart-grid" style="margin-top:1rem">
        <div class="ta-card">
          <h2 class="ta-card__title">Top ahorro</h2>
          <ta-echart [options]="barOpt()" height="240px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">Urgencia de los hallazgos</h2>
          <ta-echart [options]="pieOpt()" height="240px" />
        </div>
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <ul class="ta-finding-list">
          @for (f of filtered(); track f.findingId) {
            <li>
              <span class="ta-sev" [attr.data-sev]="f.severity">{{ f.severity }}</span>
              <div>
                <strong>{{ f.title }}</strong>
                <div class="ta-meta">
                  {{ f.category }} · {{ f.resourceId }} · USD
                  {{ f.estimatedMonthlySavingsUsd | number: '1.0-2' }}/mes
                </div>
                <div class="ta-meta"><strong>Cómo ahorrar:</strong> {{ f.recommendedAction }}</div>
              </div>
            </li>
          } @empty {
            <li class="ta-meta">{{ emptyHint() }}</li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class FinopsPageComponent implements OnInit {
  readonly audit = inject(AuditLiveService);

  readonly tabs: Array<{ id: FinopsTab; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'rightsizing', label: 'Sobredimensionados' },
    { id: 'modernization', label: 'Modernización' },
    { id: 'orphaned', label: 'Sin uso' },
  ];

  readonly tab = signal<FinopsTab>('all');
  tabModel: FinopsTab = 'all';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtered = computed(() => {
    const t = this.tab();
    const list = this.audit.findings().filter((f) => f.domain === 'finops');
    if (t === 'all') return list;
    return list.filter((f) => f.category === t);
  });

  readonly filteredSavings = computed(() =>
    this.filtered().reduce((acc, f) => acc + f.estimatedMonthlySavingsUsd, 0),
  );

  readonly emptyHint = computed(() => {
    const a = this.audit.activeAudit();
    const total = this.audit.findings().length;
    if (!a) {
      return 'No hay audit para esta cuenta. Ejecutá uno desde Audits o Dashboard.';
    }
    if (a.status !== 'completed') {
      return `El audit activo está en «${a.status}». Esperá a completed o elegí uno terminado en Historial.`;
    }
    if (total === 0) {
      return 'El audit completed no tiene findings persistidos. Redeployá aggregate_audit/api y corré un audit nuevo.';
    }
    return 'Sin oportunidades de ahorro en esta revisión. Revisá Inventario o Seguridad.';
  });

  readonly barOpt = computed(() =>
    savingsBarOption(
      this.filtered()
        .filter((f) => f.estimatedMonthlySavingsUsd > 0)
        .sort((a, b) => b.estimatedMonthlySavingsUsd - a.estimatedMonthlySavingsUsd)
        .map((f) => ({
          name: f.resourceId || f.title.slice(0, 24),
          value: Math.round(f.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  readonly pieOpt = computed(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of this.filtered()) {
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
      await this.audit.refreshAudits({ preferCompleted: true });
      const id = this.audit.activeAudit()?.auditId;
      if (id) await this.audit.refreshFindings(id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
