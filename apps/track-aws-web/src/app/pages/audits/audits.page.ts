import { DecimalPipe } from '@angular/common';
import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import {
  AuditFindingView,
  AuditJobView,
  ScanService,
} from '../../services/scan.service';
import { AppSyncRealtimeService } from '../../services/appsync-realtime.service';

@Component({
  standalone: true,
  selector: 'app-audits-page',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule, DecimalPipe],
  template: `
    <section class="ta-page">
      <h1>Audits</h1>
      <p>Historial de ejecuciones Step Functions (FinOps + Prowler).</p>

      <div class="ta-card" style="display:grid;gap:0.75rem;margin-bottom:1rem">
        <button type="button" class="ta-btn ta-btn--ghost" [disabled]="busy()" (click)="refresh()">
          {{ busy() ? 'Cargando…' : 'Actualizar lista' }}
        </button>
        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
        @if (realtime.auditStatus(); as st) {
          <div class="ta-meta">
            Live: {{ st.auditId }} · {{ st.status }} · score {{ st.globalScore }} ·
            CRITICAL {{ st.criticalCount }} / HIGH {{ st.highCount }}
          </div>
        }
      </div>

      <div class="ta-card">
        <ul style="margin:0;padding-left:1.1rem;display:grid;gap:0.5rem">
          @for (a of audits(); track a.auditId) {
            <li>
              <button type="button" class="ta-btn ta-btn--ghost" (click)="select(a)">
                {{ a.auditId.slice(0, 8) }}… · {{ a.status }} · acct {{ a.accountId }} ·
                score {{ a.globalScore }} · USD {{ a.estimatedMonthlySavingsUsd | number: '1.0-2' }}
              </button>
            </li>
          } @empty {
            <li class="ta-meta">Sin audits todavía.</li>
          }
        </ul>
      </div>

      @if (selected(); as sel) {
        <div class="ta-card" style="margin-top:1rem;display:grid;gap:0.5rem">
          <h2 style="margin:0;font-size:1.1rem">Audit {{ sel.auditId }}</h2>
          <div class="ta-meta">Status: {{ sel.status }}</div>
          <div class="ta-meta">
            Findings {{ sel.findingCount }} · CRITICAL {{ sel.criticalCount }} · HIGH {{ sel.highCount }}
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
export class AuditsPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly scanService = inject(ScanService);
  readonly realtime = inject(AppSyncRealtimeService);

  readonly audits = signal<AuditJobView[]>([]);
  readonly selected = signal<AuditJobView | null>(null);
  readonly findings = signal<AuditFindingView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.audits.set(await this.scanService.listAudits({ limit: 30 }));
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
}
