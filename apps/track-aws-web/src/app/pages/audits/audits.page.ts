import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, ViewEncapsulation, computed, inject } from '@angular/core';
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';
import { AuditProgressComponent } from '../../ui/audit/audit-progress.component';
import { StatusBadgeComponent } from '../../ui/audit/status-badge.component';
import {
  FriendlyFinding,
  humanizeFinding,
  type FindingLike,
} from '../../core/copy/friendly-finding';
import { UiLocaleService } from '../../core/i18n/ui-locale.service';

@Component({
  standalone: true,
  selector: 'app-audits-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DatePipe,
    DecimalPipe,
    PageHeaderComponent,
    AuditProgressComponent,
    StatusBadgeComponent,
  ],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Executions"
        title="Audits"
        subtitle="Historial Step Functions con seguimiento live del pipeline."
      >
        <button
          type="button"
          class="ta-btn"
          [disabled]="audit.starting() || !tenant.activeAccountId() || audit.isRunning()"
          (click)="start()"
        >
          {{ audit.starting() ? 'Iniciando…' : 'Nuevo audit' }}
        </button>
        <button
          type="button"
          class="ta-btn ta-btn--ghost"
          [disabled]="audit.busy()"
          (click)="refresh()"
        >
          {{ audit.busy() ? 'Cargando…' : 'Actualizar' }}
        </button>
      </ta-page-header>

      @if (audit.error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ audit.error() }}</div>
      }

      <div class="ta-audits-layout">
        <div class="ta-card">
          <ta-audit-progress
            [stages]="audit.stages()"
            [percent]="audit.progressPercent()"
            [live]="audit.isRunning()"
            [title]="selectedTitle()"
            eyebrow="Pipeline live"
          />
          @if (selected(); as sel) {
            <div class="ta-audits-meta">
              <div><span class="ta-field__label">Status</span><ta-status-badge [status]="sel.status" /></div>
              <div>
                <span class="ta-field__label">Score</span>
                <strong>{{ sel.globalScore }}</strong>
              </div>
              <div>
                <span class="ta-field__label">Findings</span>
                <strong>{{ sel.findingCount }}</strong>
              </div>
              <div>
                <span class="ta-field__label">CRITICAL / HIGH</span>
                <strong>{{ sel.criticalCount }} / {{ sel.highCount }}</strong>
              </div>
              <div>
                <span class="ta-field__label">Ahorro $/mes</span>
                <strong>{{ sel.estimatedMonthlySavingsUsd | number: '1.0-0' }}</strong>
              </div>
            </div>
          }
        </div>

        <div class="ta-card ta-card--flat">
          <h2 class="ta-card__title">Historial</h2>
          <ul class="ta-account-list">
            @for (a of audit.audits(); track a.auditId) {
              <li
                class="ta-audit-row"
                [class.ta-audit-row--active]="a.auditId === audit.activeAuditId()"
                (click)="select(a.auditId)"
              >
                <div>
                  <strong>{{ a.auditId.slice(0, 8) }}…</strong>
                  <div class="ta-meta">
                    {{ a.accountId }} · {{ a.createdAtIso | date: 'short' }}
                  </div>
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center">
                  <span class="ta-meta">{{ a.globalScore }}</span>
                  <ta-status-badge [status]="a.status" />
                </div>
              </li>
            } @empty {
              <li class="ta-meta">Todavía no hay audits. Iniciá uno desde aquí o el Dashboard.</li>
            }
          </ul>
        </div>
      </div>

      @if (audit.findings().length) {
        <div class="ta-card" style="margin-top:1rem">
          <h2 class="ta-card__title">Findings del audit seleccionado</h2>
          <ul class="ta-finding-list">
            @for (f of audit.findings().slice(0, 40); track f.findingId) {
              <li>
                <span class="ta-sev" [attr.data-sev]="f.severity">{{ friendly(f).urgencyLabel }}</span>
                <div>
                  <strong>{{ friendly(f).headline }}</strong>
                  <div class="ta-meta">
                    {{ friendly(f).areaLabel }}
                    @if (friendly(f).where) {
                      · {{ friendly(f).where }}
                    }
                    · {{ f.estimatedMonthlySavingsUsd | number: '1.0-0' }} USD/mes
                  </div>
                </div>
              </li>
            }
          </ul>
        </div>
      }
    </section>
  `,
})
export class AuditsPageComponent implements OnInit {
  readonly audit = inject(AuditLiveService);
  readonly tenant = inject(TenantContextService);
  readonly locale = inject(UiLocaleService);

  readonly selected = computed(() => this.audit.activeAudit());

  friendly(f: FindingLike): FriendlyFinding {
    return humanizeFinding(f, this.locale.lang());
  }

  ngOnInit(): void {
    void this.audit.bootstrap();
  }

  selectedTitle(): string {
    const a = this.selected();
    if (!a) return 'Sin ejecución seleccionada';
    return `Audit ${a.auditId.slice(0, 8)}…`;
  }

  select(auditId: string): void {
    this.audit.selectAudit(auditId);
  }

  async start(): Promise<void> {
    await this.audit.startAudit();
  }

  async refresh(): Promise<void> {
    await this.audit.refreshAudits();
  }
}
