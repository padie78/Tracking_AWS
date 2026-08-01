import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import {
  AccountInventoryView,
  ScanService,
} from '../../services/scan.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';

type InventorySource = 'live' | 'audit';
type ResourceFilter = 'all' | 'ec2' | 'ebs' | 'eip';

@Component({
  standalone: true,
  selector: 'app-inventory-page',
  encapsulation: ViewEncapsulation.None,
  imports: [DatePipe, DecimalPipe, FormsModule, PageHeaderComponent],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Assets"
        title="Inventario"
        subtitle="EC2, EBS y Elastic IP de la cuenta AWS seleccionada."
      >
        <button
          type="button"
          class="ta-btn ta-btn--ghost"
          [disabled]="busy()"
          (click)="refresh()"
        >
          {{ busy() ? 'Cargando…' : 'Actualizar' }}
        </button>
      </ta-page-header>

      <div class="ta-form-grid ta-form-grid--2" style="margin-bottom: 1rem">
        <label class="ta-field">
          <span class="ta-field__label">Fuente</span>
          <select class="ta-select" [ngModel]="source()" (ngModelChange)="onSourceChange($event)">
            <option value="live">En vivo (AssumeRole)</option>
            <option value="audit">Último audit completado</option>
          </select>
        </label>
        <label class="ta-field">
          <span class="ta-field__label">Tipo</span>
          <select class="ta-select" [ngModel]="filter()" (ngModelChange)="filter.set($event)">
            <option value="all">Todos</option>
            <option value="ec2">EC2</option>
            <option value="ebs">EBS</option>
            <option value="eip">Elastic IP</option>
          </select>
        </label>
      </div>

      @if (error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      @if (inventory(); as inv) {
        <div class="ta-meta" style="margin-bottom: 0.75rem">
          Cuenta <code>{{ inv.accountId }}</code>
          · capturado {{ inv.capturedAtIso | date: 'medium' }}
          · fuente {{ inv.source }}
          @if (inv.auditId) {
            · audit <code>{{ inv.auditId }}</code>
          }
        </div>

        <div class="ta-kpi-grid">
          <div class="ta-kpi">
            <div class="ta-kpi__label">EC2</div>
            <div class="ta-kpi__value">{{ inv.summary.ec2Count }}</div>
            <div class="ta-meta">
              {{ inv.summary.runningEc2Count }} running ·
              {{ inv.summary.stoppedEc2Count }} stopped
            </div>
          </div>
          <div class="ta-kpi">
            <div class="ta-kpi__label">EBS</div>
            <div class="ta-kpi__value">{{ inv.summary.ebsCount }}</div>
            <div class="ta-meta">{{ inv.summary.unattachedEbsCount }} unattached</div>
          </div>
          <div class="ta-kpi">
            <div class="ta-kpi__label">Elastic IP</div>
            <div class="ta-kpi__value">{{ inv.summary.eipCount }}</div>
            <div class="ta-meta">{{ inv.summary.idleEipCount }} idle</div>
          </div>
          <div class="ta-kpi">
            <div class="ta-kpi__label">Costo est. $/mes</div>
            <div class="ta-kpi__value ta-kpi__value--accent">
              {{ totalCost() | number: '1.0-0' }}
            </div>
          </div>
        </div>

        <div class="ta-card" style="margin-top:1rem; overflow-x:auto">
          <table class="ta-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>ID</th>
                <th>Región</th>
                <th>Estado</th>
                <th>Detalle</th>
                <th>$/mes</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filtered(); track r.resourceArn + r.resourceId) {
                <tr>
                  <td><span class="ta-chip">{{ r.resourceType }}</span></td>
                  <td>
                    <code>{{ r.resourceId }}</code>
                  </td>
                  <td>{{ r.region }}</td>
                  <td>{{ r.state }}</td>
                  <td>{{ r.detail }}</td>
                  <td>{{ r.estimatedMonthlyCostUsd | number: '1.2-2' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="ta-meta">
                    Sin recursos en el filtro actual.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!busy() && !error()) {
        <div class="ta-card">
          <p class="ta-meta" style="margin:0">
            Seleccioná una cuenta activa en el header y pulsá Actualizar.
            Para fuente “audit”, necesitás un audit completed (idealmente nuevo tras el deploy).
          </p>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .ta-field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .ta-field__label {
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ta-muted, #64748b);
      }
      .ta-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      .ta-table th,
      .ta-table td {
        text-align: left;
        padding: 0.65rem 0.75rem;
        border-bottom: 1px solid var(--ta-border, #e2e8f0);
        vertical-align: top;
      }
      .ta-table th {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ta-muted, #64748b);
        font-weight: 600;
      }
      .ta-table code {
        font-size: 0.82rem;
      }
    `,
  ],
})
export class InventoryPageComponent implements OnInit {
  private readonly scan = inject(ScanService);
  private readonly tenant = inject(TenantContextService);
  private readonly audit = inject(AuditLiveService);

  readonly source = signal<InventorySource>('live');
  readonly filter = signal<ResourceFilter>('all');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly inventory = signal<AccountInventoryView | null>(null);

  readonly filtered = computed(() => {
    const inv = this.inventory();
    if (!inv) return [];
    const f = this.filter();
    if (f === 'all') return inv.resources;
    return inv.resources.filter((r) => r.resourceType === f);
  });

  readonly totalCost = computed(() =>
    this.filtered().reduce((acc, r) => acc + (r.estimatedMonthlyCostUsd || 0), 0),
  );

  ngOnInit(): void {
    void this.refresh();
  }

  onSourceChange(value: InventorySource): void {
    this.source.set(value);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.source() === 'live') {
        const accountId = this.tenant.activeAccountId();
        if (!accountId) {
          this.inventory.set(null);
          this.error.set('Seleccioná una cuenta AWS en el header.');
          return;
        }
        this.inventory.set(await this.scan.getAccountInventory(accountId));
        return;
      }

      await this.audit.refreshAudits();
      const accountId = this.tenant.activeAccountId();
      const completed = this.audit
        .audits()
        .find(
          (a) =>
            a.status === 'completed' &&
            (!accountId || a.accountId === accountId),
        );
      if (!completed) {
        this.inventory.set(null);
        this.error.set('No hay audits completed para mostrar inventario.');
        return;
      }
      const fromAudit = await this.scan.listAuditInventory(completed.auditId);
      if (!fromAudit) {
        this.inventory.set(null);
        this.error.set(
          'El audit no tiene inventario persistido. Ejecutá un audit nuevo tras el deploy.',
        );
        return;
      }
      this.inventory.set(fromAudit);
    } catch (err) {
      this.inventory.set(null);
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
