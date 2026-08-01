import { DecimalPipe } from '@angular/common';
import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { AuditJobView, ScanService } from '../../services/scan.service';

@Component({
  standalone: true,
  selector: 'app-reports-page',
  encapsulation: ViewEncapsulation.None,
  imports: [DecimalPipe],
  template: `
    <section class="ta-page">
      <h1>Reportes</h1>
      <p>
        Executive summaries Markdown generados al completar el audit (S3
        <code>tenants/…/reports/</code>).
      </p>

      <div class="ta-card" style="display:grid;gap:0.75rem">
        <button type="button" class="ta-btn ta-btn--ghost" [disabled]="busy()" (click)="refresh()">
          {{ busy() ? 'Cargando…' : 'Actualizar audits' }}
        </button>
        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
        <ul style="margin:0;padding-left:1.1rem">
          @for (a of completed(); track a.auditId) {
            <li>
              <strong>{{ a.auditId }}</strong>
              <span class="ta-meta">
                — score {{ a.globalScore }} · USD
                {{ a.estimatedMonthlySavingsUsd | number: '1.0-2' }} ·
                CRITICAL {{ a.criticalCount }}
              </span>
              <div class="ta-meta">
                Key esperada:
                tenants/{{ a.tenantId }}/audits/{{ a.auditId }}/reports/*.md
              </div>
            </li>
          } @empty {
            <li class="ta-meta">Sin audits completed.</li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class ReportsPageComponent implements OnInit {
  private readonly scanService = inject(ScanService);

  readonly audits = signal<AuditJobView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly completed = computed(() =>
    this.audits().filter((a) => a.status === 'completed'),
  );

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
}
