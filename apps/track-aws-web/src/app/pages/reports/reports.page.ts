import { DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AuditLiveService } from '../../core/audit/audit-live.service';
import {
  AuditReportView,
  ScanService,
} from '../../services/scan.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';
import { StatusBadgeComponent } from '../../ui/audit/status-badge.component';
import { MarkdownComponent } from '../../ui/markdown/markdown.component';

@Component({
  standalone: true,
  selector: 'app-reports-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DecimalPipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    MarkdownComponent,
  ],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Cliente"
        title="Informe de auditoría"
        subtitle="Inventario, postura, riesgos explotables, ahorro y narrativa IA generada al completar el audit."
      >
        <button type="button" class="ta-btn ta-btn--ghost" [disabled]="busy()" (click)="refresh()">
          {{ busy() ? 'Cargando…' : 'Actualizar' }}
        </button>
      </ta-page-header>

      @if (error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <div class="ta-audits-layout">
        <div class="ta-card ta-card--flat">
          <h2 class="ta-card__title">Audits completed</h2>
          <ul class="ta-account-list">
            @for (a of completed(); track a.auditId) {
              <li
                class="ta-audit-row"
                [class.ta-audit-row--active]="a.auditId === selectedId()"
                (click)="select(a.auditId)"
              >
                <div>
                  <strong>{{ a.auditId.slice(0, 8) }}…</strong>
                  <div class="ta-meta">score {{ a.globalScore }} · CRITICAL {{ a.criticalCount }}</div>
                </div>
                <ta-status-badge [status]="a.status" />
              </li>
            } @empty {
              <li class="ta-meta">Todavía no hay audits completed con informe.</li>
            }
          </ul>
        </div>

        <div class="ta-card">
          @if (report(); as r) {
            <div class="ta-kpi-grid" style="margin-bottom:1rem">
              <div class="ta-kpi">
                <div class="ta-kpi__label">Score</div>
                <div class="ta-kpi__value">{{ r.globalScore | number: '1.0-0' }}</div>
              </div>
              <div class="ta-kpi">
                <div class="ta-kpi__label">Ahorro $/mes</div>
                <div class="ta-kpi__value ta-kpi__value--accent">
                  {{ r.estimatedMonthlySavingsUsd | number: '1.0-0' }}
                </div>
              </div>
              <div class="ta-kpi">
                <div class="ta-kpi__label">CRITICAL</div>
                <div class="ta-kpi__value ta-kpi__value--danger">{{ r.criticalCount }}</div>
              </div>
              <div class="ta-kpi">
                <div class="ta-kpi__label">IA</div>
                <div class="ta-kpi__value" style="font-size:1rem">
                  {{ r.aiGenerated ? 'Bedrock' : 'Plantilla' }}
                </div>
              </div>
            </div>

            @if (r.inventorySummary; as inv) {
              <div class="ta-card ta-card--flat" style="margin-bottom:1rem;box-shadow:none">
                <h2 class="ta-card__title">Inventario y postura</h2>
                <div class="ta-kpi-grid">
                  <div class="ta-kpi"><div class="ta-kpi__label">EC2</div><div class="ta-kpi__value">{{ inv.ec2Count }}</div>
                    <div class="ta-meta">{{ inv.runningEc2Count }} running · {{ inv.stoppedEc2Count }} stopped</div>
                  </div>
                  <div class="ta-kpi"><div class="ta-kpi__label">EBS</div><div class="ta-kpi__value">{{ inv.ebsCount }}</div>
                    <div class="ta-meta">{{ inv.unattachedEbsCount }} sin adjuntar (waste)</div>
                  </div>
                  <div class="ta-kpi"><div class="ta-kpi__label">EIP</div><div class="ta-kpi__value">{{ inv.eipCount }}</div>
                    <div class="ta-meta">{{ inv.idleEipCount }} idle (cargo)</div>
                  </div>
                  <div class="ta-kpi"><div class="ta-kpi__label">Hallazgos</div><div class="ta-kpi__value">{{ r.findingCount }}</div>
                    <div class="ta-meta">CRITICAL {{ r.criticalCount }}</div>
                  </div>
                </div>
              </div>
            }

            <ta-markdown [content]="r.markdownBody" />
          } @else {
            <p class="ta-meta">
              Seleccioná un audit completed. El informe se genera al final del Step Functions
              (plantilla + Bedrock si el modelo está habilitado).
            </p>
          }
        </div>
      </div>

      @if (secops().length || finops().length) {
        <div class="ta-split" style="margin-top:1rem">
          <div class="ta-card">
            <h2 class="ta-card__title">Riesgos de seguridad (ataque / misconfig)</h2>
            <ul class="ta-finding-list">
              @for (f of secops().slice(0, 12); track f.findingId) {
                <li>
                  <span class="ta-sev" [attr.data-sev]="f.severity">{{ f.severity }}</span>
                  <div>
                    <strong>{{ f.title }}</strong>
                    <div class="ta-meta">{{ f.category }} · {{ f.resourceId }} · {{ f.region }}</div>
                    <div class="ta-meta">{{ f.rationale }}</div>
                    <div class="ta-meta"><strong>Mitigación:</strong> {{ f.recommendedAction }}</div>
                  </div>
                </li>
              } @empty {
                <li class="ta-meta">Sin findings SecOps en este audit.</li>
              }
            </ul>
          </div>
          <div class="ta-card">
            <h2 class="ta-card__title">Cómo ahorrar dinero</h2>
            <ul class="ta-finding-list">
              @for (f of finops().slice(0, 12); track f.findingId) {
                <li>
                  <span class="ta-sev" [attr.data-sev]="f.severity">{{ f.severity }}</span>
                  <div>
                    <strong>{{ f.title }}</strong>
                    <div class="ta-meta">
                      {{ f.category }} · USD {{ f.estimatedMonthlySavingsUsd | number: '1.0-0' }}/mes
                    </div>
                    <div class="ta-meta"><strong>Acción:</strong> {{ f.recommendedAction }}</div>
                  </div>
                </li>
              } @empty {
                <li class="ta-meta">Sin tips FinOps en este audit.</li>
              }
            </ul>
          </div>
        </div>
      }
    </section>
  `,
})
export class ReportsPageComponent implements OnInit {
  private readonly auditLive = inject(AuditLiveService);
  private readonly scan = inject(ScanService);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly report = signal<AuditReportView | null>(null);
  readonly findingsLoaded = signal(false);

  readonly completed = computed(() =>
    this.auditLive.audits().filter((a) => a.status === 'completed'),
  );
  readonly secops = computed(() =>
    this.auditLive.findings().filter((f) => f.domain === 'secops'),
  );
  readonly finops = computed(() =>
    [...this.auditLive.findings().filter((f) => f.domain === 'finops')].sort(
      (a, b) => b.estimatedMonthlySavingsUsd - a.estimatedMonthlySavingsUsd,
    ),
  );

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auditLive.refreshAudits({ preferCompleted: true });
      const first = this.completed()[0];
      if (first) await this.select(first.auditId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  async select(auditId: string): Promise<void> {
    this.selectedId.set(auditId);
    this.busy.set(true);
    this.error.set(null);
    try {
      this.auditLive.selectAudit(auditId);
      await this.auditLive.refreshFindings(auditId);
      this.findingsLoaded.set(true);
      this.report.set(await this.scan.getAuditReport(auditId));
      if (!this.report()) {
        this.error.set(
          'Todavía no hay informe persistido para este audit (puede ser anterior al deploy del generador IA). Ejecutá un audit nuevo.',
        );
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
