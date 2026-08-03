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
import { StatusBadgeComponent } from '../../ui/audit/status-badge.component';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import { severityPieOption } from '../../ui/charts/chart-options';
import {
  FriendlyFinding,
  humanizeFinding,
  type FindingLike,
} from '../../core/copy/friendly-finding';
import { UiLocaleService } from '../../core/i18n/ui-locale.service';

type AttackTab = 'all' | 'iam' | 'network' | 'storage' | 'other';

@Component({
  standalone: true,
  selector: 'app-secops-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DecimalPipe,
    FormsModule,
    ButtonModule,
    SelectButtonModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    TaEchartComponent,
    RouterLink,
  ],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Módulo 2"
        title="Centro de seguridad"
        subtitle="Problemas de acceso, red y almacenamiento que conviene corregir, ordenados por urgencia."
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
        <div class="ta-error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <div class="ta-kpi-grid">
        <div class="ta-kpi">
          <div class="ta-kpi__label">Críticos</div>
          <div class="ta-kpi__value ta-kpi__value--danger">{{ counts().CRITICAL }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Altos</div>
          <div class="ta-kpi__value ta-kpi__value--warn">{{ counts().HIGH }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Problemas de seguridad</div>
          <div class="ta-kpi__value">{{ findings().length }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">Última revisión</div>
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
          Revisión <code>{{ a.auditId.slice(0, 8) }}…</code>
          · {{ a.findingCount }} hallazgos en total · cuenta {{ a.accountId }}
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

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Distribución por severidad</h2>
        <ta-echart [options]="pieOpt()" height="240px" />
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Problemas a corregir</h2>
        <ul class="ta-finding-list">
          @for (f of filtered(); track f.findingId) {
            <li>
              <span class="ta-sev" [attr.data-sev]="f.severity">{{ friendly(f).urgencyLabel }}</span>
              <div>
                <strong>{{ friendly(f).headline }}</strong>
                <div class="ta-meta">
                  {{ friendly(f).areaLabel }}
                  @if (friendly(f).where) {
                    · {{ friendly(f).where }}
                  }
                </div>
                <div class="ta-meta"><strong>{{ locale.whyLabel() }}:</strong> {{ friendly(f).whyItMatters }}</div>
                <div class="ta-meta"><strong>{{ locale.actionLabel() }}:</strong> {{ friendly(f).whatToDo }}</div>
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
  readonly locale = inject(UiLocaleService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly tab = signal<AttackTab>('all');
  tabModel: AttackTab = 'all';

  readonly tabs: Array<{ id: AttackTab; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'iam', label: 'Accesos e identidad' },
    { id: 'network', label: 'Red' },
    { id: 'storage', label: 'Almacenamiento' },
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
      return 'Todavía no hay una revisión para esta cuenta. Iniciá una desde Resumen.';
    }
    if (a.status !== 'completed') {
      return `La revisión activa está en curso («${a.status}»). Esperá a que termine o elegí otra en Historial.`;
    }
    if (total === 0) {
      return 'Esta revisión no dejó hallazgos guardados. Probá iniciar una nueva desde Resumen.';
    }
    return 'No hay problemas de seguridad en esta revisión. Revisá Costos o el Informe.';
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

  friendly(f: FindingLike): FriendlyFinding {
    return humanizeFinding(f, this.locale.lang());
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
