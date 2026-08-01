import { DecimalPipe } from '@angular/common';
import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AppSyncRealtimeService } from '../../services/appsync-realtime.service';
import { ScanService, type FindingView, type SavingsDossierView } from '../../services/scan.service';

@Component({
  standalone: true,
  selector: 'app-feature-placeholder-page',
  encapsulation: ViewEncapsulation.None,
  imports: [DecimalPipe],
  template: `
    <section class="ta-page">
      <h1>{{ title() }}</h1>
      <p>{{ description() }}</p>

      <div class="ta-card" style="display:grid;gap:0.75rem;margin-bottom:1rem">
        <label class="ta-meta">
          Scan ID
          <input
            style="display:block;width:100%;margin-top:0.35rem;padding:0.55rem;border-radius:8px;border:1px solid var(--ta-border);background:var(--ta-bg);color:var(--ta-text)"
            [value]="scanId()"
            (input)="onScanIdInput($event)"
            placeholder="uuid del scan"
          />
        </label>
        <button type="button" class="ta-btn" [disabled]="busy() || !scanId()" (click)="load()">
          {{ busy() ? 'Cargando…' : 'Cargar findings (GraphQL)' }}
        </button>
        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
      </div>

      @if (dossier(); as d) {
        <div class="ta-card" style="display:grid;gap:0.75rem">
          <h2 style="margin:0;font-size:1.1rem">{{ d.title }}</h2>
          <div class="ta-meta">
            USD {{ d.totalEstimatedMonthlySavingsUsd | number: '1.0-2' }}/mes ·
            {{ d.findingIds.length }} findings
          </div>
          <pre style="white-space:pre-wrap;margin:0;font-family:var(--ta-font-mono);font-size:0.85rem">{{ d.markdownBody }}</pre>
        </div>
      } @else if (findings().length) {
        <div class="ta-card">
          <ul style="margin:0;padding-left:1.1rem">
            @for (f of findings(); track f.findingId) {
              <li>
                <strong>{{ f.title }}</strong>
                <div class="ta-meta">
                  {{ f.category }} · {{ f.severity }} ·
                  USD {{ f.estimatedMonthlySavingsUsd | number: '1.0-2' }}/mes
                </div>
                <div class="ta-meta">{{ f.recommendedAction }}</div>
              </li>
            }
          </ul>
        </div>
      } @else if (!busy()) {
        <div class="ta-card">
          <p class="ta-meta">
            Sin datos cargados. Iniciá un scan desde Dashboard o pegá un scanId.
          </p>
        </div>
      }
    </section>
  `,
})
export class FeaturePlaceholderPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly scanService = inject(ScanService);
  private readonly realtime = inject(AppSyncRealtimeService);

  readonly title = toSignal(
    this.route.data.pipe(map((d) => String(d['title'] ?? 'Feature'))),
    { initialValue: 'Feature' },
  );

  readonly description = toSignal(
    this.route.data.pipe(map((d) => String(d['description'] ?? ''))),
    { initialValue: '' },
  );

  readonly scanId = signal('');
  readonly findings = signal<FindingView[]>([]);
  readonly dossier = signal<SavingsDossierView | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  private categoryFilter: string | null = null;

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path ?? '';
    this.categoryFilter =
      path === 'rightsizing' || path === 'modernization' || path === 'orphaned'
        ? path
        : path === 'dossier'
          ? null
          : null;

    const tenantId = this.auth.tenantId();
    if (tenantId) this.realtime.ensureConnected(tenantId);
  }

  onScanIdInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.scanId.set(value);
  }

  async load(): Promise<void> {
    const scanId = this.scanId();
    const tenantId = this.auth.tenantId() ?? undefined;
    if (!scanId) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.route.snapshot.routeConfig?.path === 'dossier') {
        const dossier = await this.scanService.getSavingsDossier({ scanId });
        this.dossier.set(dossier);
        this.realtime.seedDossier(dossier);
        this.findings.set([]);
        if (!dossier) this.error.set('No hay dossier para ese scan.');
        return;
      }

      this.dossier.set(null);
      let rows = await this.scanService.listFindingsByScan(scanId);
      if (this.categoryFilter) {
        rows = rows.filter((f) => f.category === this.categoryFilter);
      }
      this.findings.set(rows);
      this.realtime.seedFindings(rows);
      this.realtime.ensureConnected(tenantId, { scanId });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
