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
import {
  AuditFindingView,
  AuditJobView,
  ScanService,
} from '../../services/scan.service';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import { severityPieOption } from '../../ui/charts/chart-options';

@Component({
  standalone: true,
  selector: 'app-secops-page',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule, DecimalPipe, TaEchartComponent],
  template: `
    <section class="ta-page ta-page--wide">
      <div class="ta-page__head">
        <div>
          <h1>SecOps</h1>
          <p>Findings Prowler (CIS / IAM / network / storage) del audit seleccionado.</p>
        </div>
        <button type="button" class="ta-btn ta-btn--ghost" [disabled]="busy()" (click)="useLatest()">
          {{ busy() ? 'Cargando…' : 'Último audit' }}
        </button>
      </div>

      <div class="ta-card" style="display:grid;gap:0.75rem;margin-bottom:1rem">
        <label>
          Audit ID
          <input name="auditId" [(ngModel)]="auditId" placeholder="uuid del audit" />
        </label>
        <button type="button" class="ta-btn" [disabled]="busy() || !auditId.trim()" (click)="load()">
          Cargar findings SecOps
        </button>
        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
      </div>

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
          <div class="ta-kpi__label">Total SecOps</div>
          <div class="ta-kpi__value">{{ findings().length }}</div>
        </div>
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">Distribución por severidad</h2>
        <ta-echart [options]="pieOpt()" height="260px" />
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <ul class="ta-finding-list">
          @for (f of findings(); track f.findingId) {
            <li>
              <span class="ta-sev" [attr.data-sev]="f.severity">{{ f.severity }}</span>
              <div>
                <strong>{{ f.title }}</strong>
                <div class="ta-meta">{{ f.checkId }} · {{ f.region }} · {{ f.resourceId }}</div>
                <div class="ta-meta">{{ f.rationale }}</div>
              </div>
            </li>
          } @empty {
            <li class="ta-meta">Sin findings SecOps.</li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class SecopsPageComponent implements OnInit {
  private readonly scanService = inject(ScanService);

  auditId = '';
  readonly findings = signal<AuditFindingView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly counts = computed(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of this.findings()) {
      if (f.severity in c) c[f.severity as keyof typeof c] += 1;
    }
    return c;
  });

  readonly pieOpt = computed(() => severityPieOption(this.counts()));

  ngOnInit(): void {
    void this.useLatest();
  }

  async useLatest(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const list: AuditJobView[] = await this.scanService.listAudits({ limit: 1 });
      const latest = list[0];
      if (!latest) {
        this.error.set('No hay audits. Ejecutá startAudit desde Dashboard.');
        return;
      }
      this.auditId = latest.auditId;
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
      this.busy.set(false);
    }
  }

  async load(): Promise<void> {
    const auditId = this.auditId.trim();
    if (!auditId) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.findings.set(
        await this.scanService.listAuditFindings(auditId, 'secops'),
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
