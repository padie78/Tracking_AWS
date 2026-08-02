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
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';
import { StatusBadgeComponent } from '../../ui/audit/status-badge.component';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import { severityPieOption } from '../../ui/charts/chart-options';

type AttackTab = 'all' | 'iam' | 'network' | 'storage' | 'other';

@Component({
  standalone: true,
  selector: 'app-secops-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DecimalPipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    TaEchartComponent,
    RouterLink,
  ],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Security"
        title="SecOps"
        subtitle="Superficie de ataque: IAM, network abierta, storage público. Qué puede ser explotado y cómo cerrarlo."
      >
        <button type="button" class="ta-btn ta-btn--ghost" [disabled]="busy()" (click)="refresh()">
          {{ busy() ? 'Cargando…' : 'Actualizar' }}
        </button>
      </ta-page-header>

      @if (error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <div class="ta-kpi-grid">
        <div class="ta-kpi">
          <div class="ta-kpi__label">CRITICAL</div>
          <div class="ta-kpi__value ta-kpi__value--danger">{{ counts().CRITICAL }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">HIGH</div>
          <div class="ta-kpi__value ta-kpi__value--warn">{{ counts().HIGH }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Attack findings</div>
          <div class="ta-kpi__value">{{ findings().length }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Audit</div>
          <div class="ta-kpi__value" style="font-size:0.95rem">
            @if (audit.activeAudit(); as a) {
              <ta-status-badge [status]="a.status" />
            } @else {
              —
            }
          </div>
        </div>
      </div>

      @if (audit.activeAudit(); as a) {
        <div class="ta-meta" style="margin:0.75rem 0">
          Audit <code>{{ a.auditId.slice(0, 8) }}…</code>
          · {{ a.findingCount }} findings totales · cuenta {{ a.accountId }}
          ·
          <a class="ta-link" routerLink="/tabs/audits">cambiar en Historial</a>
        </div>
      }

      <div class="ta-tabs" style="margin-top:1rem">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            class="ta-tabs__btn"
            [class.active]="tab() === t.id"
            (click)="tab.set(t.id)"
          >
            {{ t.label }}
          </button>
        }
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Distribución por severidad</h2>
        <ta-echart [options]="pieOpt()" height="240px" />
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Qué puede ser atacado / misconfigurations</h2>
        <ul class="ta-finding-list">
          @for (f of filtered(); track f.findingId) {
            <li>
              <span class="ta-sev" [attr.data-sev]="f.severity">{{ f.severity }}</span>
              <div>
                <strong>{{ f.title }}</strong>
                <div class="ta-meta">
                  {{ attackBucket(f.category, f.title, f.checkId) }} ·
                  {{ f.checkId || 'n/a' }} · {{ f.region }} · {{ f.resourceId }}
                </div>
                <div class="ta-meta"><strong>Riesgo:</strong> {{ f.rationale }}</div>
                <div class="ta-meta"><strong>Mitigación:</strong> {{ f.recommendedAction }}</div>
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
export class SecopsPageComponent implements OnInit {
  readonly audit = inject(AuditLiveService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly tab = signal<AttackTab>('all');

  readonly tabs: Array<{ id: AttackTab; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'iam', label: 'IAM / identidad' },
    { id: 'network', label: 'Network' },
    { id: 'storage', label: 'Storage' },
    { id: 'other', label: 'Otros' },
  ];

  readonly findings = computed(() =>
    this.audit
      .findings()
      .filter((f) => f.domain === 'secops')
      .slice()
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
  );

  readonly filtered = computed(() => {
    const t = this.tab();
    if (t === 'all') return this.findings();
    return this.findings().filter(
      (f) => this.attackBucket(f.category, f.title, f.checkId) === t,
    );
  });

  readonly counts = computed(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of this.findings()) {
      if (f.severity in c) c[f.severity as keyof typeof c] += 1;
    }
    return c;
  });

  readonly pieOpt = computed(() => severityPieOption(this.counts()));

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
      return 'Sin findings persistidos. Redeployá aggregate_audit (fallback SecOps) + api y corré un audit nuevo.';
    }
    return 'Sin findings SecOps en este audit (Prowler vacío y fallback sin hits). Revisá FinOps o el Informe.';
  });

  attackBucket(
    category: string,
    title: string,
    checkId: string | null,
  ): AttackTab {
    const hay = `${category} ${title} ${checkId ?? ''}`.toLowerCase();
    if (/iam|mfa|password|root|identity|user/.test(hay)) return 'iam';
    if (/sg|security.group|0\.0\.0\.0|network|port|ssh|rdp/.test(hay)) return 'network';
    if (/s3|bucket|storage|public.access/.test(hay)) return 'storage';
    return 'other';
  }

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

function severityRank(severity: string): number {
  const map: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    INFO: 4,
  };
  return map[severity] ?? 9;
}
