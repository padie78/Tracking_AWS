import { DecimalPipe, NgClass } from '@angular/common';
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
import {
  savingsBarOption,
  smoothLineOption,
  verticalColumnOption,
} from '../../ui/charts/chart-options';
import {
  FriendlyFinding,
  humanizeFinding,
  type FindingLike,
} from '../../core/copy/friendly-finding';
import { UiLocaleService } from '../../core/i18n/ui-locale.service';
import type { AuditFindingView } from '../../services/scan.service';

type FinopsTab = 'all' | 'rightsizing' | 'modernization' | 'orphaned';
type FinopsArea = Exclude<FinopsTab, 'all'>;

type FinopsCard = {
  finding: AuditFindingView;
  ui: FriendlyFinding;
  bucket: FinopsArea;
  service: string;
};

/** Solo hallazgos de costo reales — nunca Prowler/Trivy/IAM/secrets. */
function isFinopsFinding(f: FindingLike): boolean {
  const hay = [
    f.checkId,
    f.title,
    f.category,
    f.rationale,
    f.domain,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    /prowler|trivy|cis[_-]|awslambda_function_no_secrets|secrets?_in_code|hardcoded.?secret|security.?group|iam_user|user_mfa|\bmfa\b|cve-|vulnerability|public_access|0\.0\.0\.0|ssh_open|rdp/.test(
      hay,
    )
  ) {
    return false;
  }

  const domain = (f.domain || '').toLowerCase();
  if (domain === 'secops' || domain === 'architecture') return false;

  if (domain === 'finops') return true;

  return (
    (f.estimatedMonthlySavingsUsd ?? 0) > 0 ||
    /rightsiz|orphan|unattached|eip|infracost|waste|retention|moderniz|cost_|ebs_unused|idle|underutil|sobredimension|graviton|log_group|serverless_waste/.test(
      hay,
    )
  );
}

function finopsBucket(
  category: string,
  title: string,
  checkId: string | null,
): FinopsArea {
  const hay = `${category} ${title} ${checkId ?? ''}`.toLowerCase();
  if (
    /orphan|unattached|unused|idle|eip|huerf|sin uso|ebs_unused|cost_ebs|log_group|retention|serverless_waste|waste/.test(
      hay,
    )
  ) {
    return 'orphaned';
  }
  if (/moderniz|graviton|t2\b|legacy|generation/.test(hay)) {
    return 'modernization';
  }
  return 'rightsizing';
}

@Component({
  standalone: true,
  selector: 'app-finops-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DecimalPipe,
    NgClass,
    FormsModule,
    ButtonModule,
    SelectButtonModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    TaEchartComponent,
    RouterLink,
  ],
  template: `
    <section class="ta-page ta-page--wide ta-finops">
      <ta-page-header
        [eyebrow]="locale.isEn() ? 'Module 4' : 'Módulo 4'"
        [title]="locale.isEn() ? 'Spend control' : 'Control de gastos'"
        [subtitle]="
          locale.isEn()
            ? 'Idle or oversized resources, savings opportunities and spend signals.'
            : 'Recursos caros o sin uso, oportunidades de ahorro y avisos de gasto.'
        "
      >
        <button
          pButton
          type="button"
          class="p-button-outlined"
          icon="pi pi-refresh"
          [label]="
            busy()
              ? locale.isEn()
                ? 'Loading…'
                : 'Cargando…'
              : locale.isEn()
                ? 'Refresh'
                : 'Actualizar'
          "
          [disabled]="busy()"
          (click)="refresh()"
        ></button>
      </ta-page-header>

      @if (error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <!-- KPI hero -->
      <div class="ta-kpi-grid ta-kpi-grid--hero">
        <div class="ta-kpi ta-kpi--health" [attr.data-tone]="savingsTone()">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Monthly savings potential' : 'Ahorro potencial mensual' }}
          </div>
          <div class="ta-kpi__value ta-kpi__value--accent">
            \${{ filteredSavings() | number: '1.2-2' }}
          </div>
          <div class="ta-kpi__hint">USD / {{ locale.isEn() ? 'month' : 'mes' }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Annual savings' : 'Ahorro anual' }}
          </div>
          <div class="ta-kpi__value ta-kpi__value--accent">
            \${{ filteredAnnualSavings() | number: '1.0-0' }}
          </div>
          <div class="ta-kpi__hint">USD / {{ locale.isEn() ? 'year' : 'año' }}</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Cost opportunities' : 'Oportunidades de ahorro' }}
          </div>
          <div class="ta-kpi__value">{{ filteredCards().length }}</div>
          <div class="ta-kpi__hint">
            {{ cards().length }}
            {{ locale.isEn() ? 'total in scan' : 'total en la revisión' }}
          </div>
        </div>
      </div>

      <!-- KPI secondary -->
      <div class="ta-kpi-grid ta-kpi-grid--secondary ta-kpi-grid--finops">
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Rightsizing' : 'Sobredimensionados' }}
          </div>
          <div class="ta-kpi__value">{{ bucketCounts().rightsizing }}</div>
          <div class="ta-kpi__hint">
            \${{ bucketSavings().rightsizing | number: '1.0-0' }}/{{
              locale.isEn() ? 'mo' : 'mes'
            }}
          </div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Modernization' : 'Modernización' }}
          </div>
          <div class="ta-kpi__value">{{ bucketCounts().modernization }}</div>
          <div class="ta-kpi__hint">
            \${{ bucketSavings().modernization | number: '1.0-0' }}/{{
              locale.isEn() ? 'mo' : 'mes'
            }}
          </div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Idle / orphaned' : 'Sin uso' }}
          </div>
          <div class="ta-kpi__value">{{ bucketCounts().orphaned }}</div>
          <div class="ta-kpi__hint">
            \${{ bucketSavings().orphaned | number: '1.0-0' }}/{{
              locale.isEn() ? 'mo' : 'mes'
            }}
          </div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Priced items' : 'Con precio \$' }}
          </div>
          <div class="ta-kpi__value">{{ withSavingsCount() }}</div>
          <div class="ta-kpi__hint">
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
          {{ locale.isEn() ? 'Scan' : 'Revisión' }}
          <code>{{ a.auditId.slice(0, 8) }}…</code>
          · {{ a.status }} · {{ cards().length }}
          {{ locale.isEn() ? 'cost findings' : 'hallazgos de costo' }}
          · {{ locale.isEn() ? 'account' : 'cuenta' }} {{ a.accountId }}
          ·
          <a class="ta-link" routerLink="/tabs/audits">
            {{ locale.isEn() ? 'change in History' : 'cambiar en Historial' }}
          </a>
        </div>
      }

      <p-selectButton
        [options]="tabs()"
        [(ngModel)]="tabModel"
        optionLabel="label"
        optionValue="id"
        [style]="{ width: '100%' }"
        (ngModelChange)="tab.set($event)"
      />

      <!-- Charts: 3 clear visuals -->
      <div class="ta-dash-section-head">
        <h2 class="ta-card__title" style="margin:0">
          {{ locale.isEn() ? 'Savings snapshot' : 'Panorama de ahorro' }}
        </h2>
        <span class="ta-meta">
          {{ locale.isEn() ? 'Follows the category filter' : 'Respeta el filtro de categoría' }}
        </span>
      </div>
      <div class="ta-chart-grid ta-chart-grid--finops">
        <div class="ta-card ta-card--chart-wide">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Top opportunities' : 'Mayores oportunidades' }}
          </h2>
          <ta-echart [options]="barOpt()" height="280px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'By category' : 'Por categoría' }}
          </h2>
          <ta-echart [options]="categoryColumnOpt()" height="280px" />
        </div>
        <div class="ta-card ta-card--chart-wide">
          <h2 class="ta-card__title">
            {{
              locale.isEn()
                ? 'Cumulative savings (ranked)'
                : 'Ahorro acumulado (ordenado)'
            }}
          </h2>
          <ta-echart [options]="cumulativeLineOpt()" height="260px" />
        </div>
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">
          {{ locale.isEn() ? 'Savings to capture' : 'Ahorros a capturar' }}
          <span class="ta-meta" style="margin-left:0.5rem;font-weight:500">
            {{ filteredCards().length }}
          </span>
        </h2>
        <ul class="ta-finding-list">
          @for (card of filteredCards(); track card.finding.findingId) {
            <li>
              <span class="ta-sev" [attr.data-sev]="card.finding.severity">
                {{ card.ui.urgencyLabel }}
              </span>
              <div>
                <strong>{{ card.ui.headline }}</strong>
                <div class="ta-meta">
                  <i class="pi" [ngClass]="serviceIcon(card.service)" aria-hidden="true"></i>
                  {{ card.ui.areaLabel }}
                  @if (card.finding.estimatedMonthlySavingsUsd > 0) {
                    ·
                    <span class="ta-incident__money">
                      \${{ card.finding.estimatedMonthlySavingsUsd | number: '1.2-2' }}
                      USD/{{ locale.isEn() ? 'mo' : 'mes' }}
                    </span>
                  }
                </div>
                <div class="ta-meta">
                  <strong>{{ locale.resourceLabel() }}:</strong>
                  {{ card.ui.where || '—' }}
                </div>
                <div class="ta-meta">
                  <strong>{{ locale.whyLabel() }}:</strong>
                  {{ card.ui.whyItMatters }}
                </div>
                <div class="ta-meta">
                  <strong>{{ locale.actionLabel() }}:</strong>
                  {{ card.ui.whatToDo }}
                </div>
                @if (card.ui.evidence) {
                  <div class="ta-meta">
                    <strong>{{ locale.isEn() ? 'Evidence' : 'Evidencia' }}:</strong>
                    {{ card.ui.evidence }}
                  </div>
                }
                @if (card.ui.checkLabel) {
                  <div class="ta-meta">
                    <strong>{{ locale.isEn() ? 'Check' : 'Control' }}:</strong>
                    <code>{{ card.ui.checkLabel }}</code>
                  </div>
                }
                @if (card.ui.remediation) {
                  <div class="ta-meta">
                    <strong>{{ locale.isEn() ? 'Remediation' : 'Remediación' }}:</strong>
                    {{ card.ui.remediation }}
                  </div>
                }
                @if (card.ui.consoleUrl) {
                  <div class="ta-meta">
                    <a
                      class="ta-link"
                      [href]="card.ui.consoleUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ locale.isEn() ? 'Open in AWS console' : 'Abrir en consola AWS' }}
                    </a>
                  </div>
                }
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
export class FinopsPageComponent implements OnInit {
  readonly audit = inject(AuditLiveService);
  readonly locale = inject(UiLocaleService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly tab = signal<FinopsTab>('all');
  tabModel: FinopsTab = 'all';

  readonly tabs = computed(() => {
    const en = this.locale.isEn();
    return [
      { id: 'all' as const, label: en ? 'All' : 'Todos' },
      { id: 'rightsizing' as const, label: en ? 'Rightsizing' : 'Sobredimensionados' },
      { id: 'modernization' as const, label: en ? 'Modernization' : 'Modernización' },
      { id: 'orphaned' as const, label: en ? 'Idle / orphaned' : 'Sin uso' },
    ];
  });

  readonly cards = computed((): FinopsCard[] => {
    const lang = this.locale.lang();
    const rows: FinopsCard[] = [];
    for (const f of this.audit.findings()) {
      if (!isFinopsFinding(f as FindingLike)) continue;
      const ui = humanizeFinding(f as FindingLike, lang);
      if (ui.isHealthy) continue;
      // Segunda red: copy de seguridad no entra a Costos
      if (
        /permisos|secretos hardcode|mfa|security group|puerto de red|expuest/i.test(
          ui.headline,
        )
      ) {
        continue;
      }
      rows.push({
        finding: f,
        ui,
        bucket: finopsBucket(f.category, f.title, f.checkId),
        service: ui.serviceLabel || ui.areaLabel.split('·')[0]?.trim() || 'AWS',
      });
    }
    rows.sort(
      (a, b) =>
        b.finding.estimatedMonthlySavingsUsd - a.finding.estimatedMonthlySavingsUsd ||
        severityRank(a.finding.severity) - severityRank(b.finding.severity),
    );
    return rows;
  });

  readonly filteredCards = computed(() => {
    const t = this.tab();
    if (t === 'all') return this.cards();
    return this.cards().filter((c) => c.bucket === t);
  });

  readonly filteredSavings = computed(() =>
    this.filteredCards().reduce(
      (acc, c) => acc + (c.finding.estimatedMonthlySavingsUsd || 0),
      0,
    ),
  );

  readonly filteredAnnualSavings = computed(() => this.filteredSavings() * 12);

  readonly bucketCounts = computed(() => {
    const c = { rightsizing: 0, modernization: 0, orphaned: 0 };
    for (const card of this.cards()) c[card.bucket] += 1;
    return c;
  });

  readonly bucketSavings = computed(() => {
    const c = { rightsizing: 0, modernization: 0, orphaned: 0 };
    for (const card of this.cards()) {
      c[card.bucket] += card.finding.estimatedMonthlySavingsUsd || 0;
    }
    return c;
  });

  readonly withSavingsCount = computed(
    () =>
      this.filteredCards().filter((c) => c.finding.estimatedMonthlySavingsUsd > 0)
        .length,
  );

  readonly savingsTone = computed(() => {
    const s = this.filteredSavings();
    if (s <= 0) return 'good';
    if (s < 200) return 'warn';
    return 'bad';
  });

  readonly barOpt = computed(() =>
    savingsBarOption(
      this.filteredCards()
        .filter((c) => c.finding.estimatedMonthlySavingsUsd > 0)
        .slice(0, 8)
        .map((c) => ({
          name: c.ui.where.slice(0, 28) || c.finding.resourceId.slice(0, 28),
          value: Math.round(c.finding.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  readonly categoryColumnOpt = computed(() => {
    const en = this.locale.isEn();
    const s = this.bucketSavings();
    return verticalColumnOption(
      [
        {
          name: en ? 'Rightsizing' : 'Sobredim.',
          value: Math.round(s.rightsizing),
        },
        {
          name: en ? 'Modernize' : 'Moderniz.',
          value: Math.round(s.modernization),
        },
        {
          name: en ? 'Idle' : 'Sin uso',
          value: Math.round(s.orphaned),
        },
      ],
      { valuePrefix: '$', color: '#0d9488' },
    );
  });

  readonly cumulativeLineOpt = computed(() => {
    const en = this.locale.isEn();
    const ranked = this.filteredCards()
      .filter((c) => c.finding.estimatedMonthlySavingsUsd > 0)
      .slice(0, 12);
    let running = 0;
    const points = ranked.map((c, i) => {
      running += c.finding.estimatedMonthlySavingsUsd;
      return {
        label: `#${i + 1}`,
        value: Math.round(running),
      };
    });
    if (points.length === 0) {
      points.push({ label: '—', value: 0 });
    }
    return smoothLineOption(points, {
      name: en ? 'Cumulative $/mo' : 'Acumulado $/mes',
      valuePrefix: '$',
      color: '#2563eb',
    });
  });

  readonly emptyHint = computed(() => {
    const en = this.locale.isEn();
    const a = this.audit.activeAudit();
    const total = this.audit.findings().length;
    if (!a) {
      return en
        ? 'No scan for this account yet. Start one from Overview.'
        : 'No hay revisión para esta cuenta. Iniciá una desde Resumen.';
    }
    if (a.status !== 'completed') {
      return en
        ? `Active scan is still running («${a.status}»). Wait or pick another in History.`
        : `La revisión activa está en «${a.status}». Esperá o elegí otra en Historial.`;
    }
    if (total === 0) {
      return en
        ? 'This scan stored no findings. Try a new scan from Overview.'
        : 'Esta revisión no dejó hallazgos. Probá una nueva desde Resumen.';
    }
    return en
      ? 'No cost-saving opportunities in this view. Security issues live in Security center.'
      : 'Sin oportunidades de ahorro en esta vista. Lo de seguridad está en Centro de seguridad.';
  });

  serviceIcon(service: string): string {
    const s = service.toLowerCase();
    if (s.includes('lambda')) return 'pi-bolt';
    if (s.includes('s3') || s.includes('storage') || s.includes('ebs')) {
      return 'pi-database';
    }
    if (s.includes('ec2') || s.includes('network')) return 'pi-server';
    if (s.includes('cost') || s.includes('cloudwatch')) return 'pi-wallet';
    return 'pi-chart-line';
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
