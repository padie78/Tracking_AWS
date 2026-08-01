import { DecimalPipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import {
  AuditFindingView,
  AuditJobView,
  ScanService,
} from '../../services/scan.service';
import { AppSyncRealtimeService } from '../../services/appsync-realtime.service';

const TERMINAL = new Set(['completed', 'failed']);

@Component({
  standalone: true,
  selector: 'app-audits-page',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule, DecimalPipe],
  template: `
    <section class="ta-page">
      <div class="ta-page__head">
        <div>
          <h1>Audits</h1>
          <p>Historial de ejecuciones Step Functions (FinOps + Prowler).</p>
        </div>
        <button type="button" class="ta-btn ta-btn--ghost" [disabled]="busy()" (click)="refresh()">
          {{ busy() ? 'Cargando…' : 'Actualizar lista' }}
        </button>
      </div>

      <div class="ta-card" style="display:grid;gap:0.75rem;margin-bottom:1rem">
        <div class="ta-meta">
          Realtime: {{ realtime.connectionState() }}
          @if (polling()) {
            · polling activo
          }
        </div>
        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
        @if (realtime.auditStatus(); as st) {
          <div class="ta-info">
            Live: {{ st.auditId.slice(0, 8) }}… · <strong>{{ st.status }}</strong> · score
            {{ st.globalScore }} · CRITICAL {{ st.criticalCount }} / HIGH {{ st.highCount }}
          </div>
        }
      </div>

      <div class="ta-card">
        <ul class="ta-account-list">
          @for (a of audits(); track a.auditId) {
            <li>
              <div>
                <strong>{{ a.auditId.slice(0, 8) }}…</strong>
                <div class="ta-meta">
                  acct {{ a.accountId }} · score {{ a.globalScore }} · USD
                  {{ a.estimatedMonthlySavingsUsd | number: '1.0-2' }}
                </div>
              </div>
              <div style="display:flex;gap:0.5rem;align-items:center">
                <span
                  class="ta-chip"
                  [class.ta-chip--ok]="a.status === 'completed'"
                  [class.ta-chip--warn]="!isTerminal(a.status)"
                >
                  {{ a.status }}
                </span>
                <button type="button" class="ta-btn ta-btn--ghost ta-btn--sm" (click)="select(a)">
                  Ver
                </button>
              </div>
            </li>
          } @empty {
            <li class="ta-meta">
              Sin audits en lista. Pulsá «Actualizar lista» (el último Step Functions ya terminó
              SUCCEEDED).
            </li>
          }
        </ul>
      </div>

      @if (selected(); as sel) {
        <div class="ta-card" style="margin-top:1rem;display:grid;gap:0.5rem">
          <h2 style="margin:0;font-size:1.1rem">Audit {{ sel.auditId }}</h2>
          <div class="ta-meta">Status: {{ sel.status }}</div>
          <div class="ta-meta">
            Findings {{ sel.findingCount }} · CRITICAL {{ sel.criticalCount }} · HIGH
            {{ sel.highCount }}
          </div>
          <div class="ta-meta">
            Pillars — sec {{ sel.pillarScores.security }} · cost
            {{ sel.pillarScores.costOptimization }} · rel {{ sel.pillarScores.reliability }}
          </div>
          @if (findings().length) {
            <ul style="margin:0;padding-left:1.1rem">
              @for (f of findings(); track f.findingId) {
                <li>
                  <strong>[{{ f.severity }}]</strong> {{ f.title }}
                  <span class="ta-meta"> — {{ f.domain }}/{{ f.category }}</span>
                </li>
              }
            </ul>
          }
        </div>
      }
    </section>
  `,
})
export class AuditsPageComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly scanService = inject(ScanService);
  readonly realtime = inject(AppSyncRealtimeService);

  readonly audits = signal<AuditJobView[]>([]);
  readonly selected = signal<AuditJobView | null>(null);
  readonly findings = signal<AuditFindingView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly polling = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const tenantId = this.auth.tenantId();
    if (tenantId) this.realtime.ensureConnected(tenantId);
    void this.refresh();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  isTerminal(status: string): boolean {
    return TERMINAL.has(status);
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const list = await this.scanService.listAudits({ limit: 30 });
      this.audits.set(list);
      const running = list.find((a) => !TERMINAL.has(a.status));
      if (running) {
        this.startPolling();
        const tenantId = this.auth.tenantId();
        if (tenantId) {
          this.realtime.ensureConnected(tenantId, { auditId: running.auditId });
        }
      } else {
        this.stopPolling();
      }

      const sel = this.selected();
      if (sel) {
        const updated = list.find((a) => a.auditId === sel.auditId);
        if (updated) this.selected.set(updated);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  async select(audit: AuditJobView): Promise<void> {
    this.selected.set(audit);
    const tenantId = this.auth.tenantId();
    if (tenantId) {
      this.realtime.ensureConnected(tenantId, { auditId: audit.auditId });
    }
    try {
      this.findings.set(await this.scanService.listAuditFindings(audit.auditId));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.polling.set(true);
    this.pollTimer = setInterval(() => {
      void this.refresh();
    }, 5000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.polling.set(false);
  }
}
