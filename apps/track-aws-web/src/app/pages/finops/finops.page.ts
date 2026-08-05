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
  namedDonutOption,
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

type FinopsTab =
  | 'all'
  | 'rightsizing'
  | 'modernization'
  | 'orphaned'
  | 'inventory';
type FinopsArea = Exclude<FinopsTab, 'all'>;

type FinopsCard = {
  finding: AuditFindingView;
  ui: FriendlyFinding;
  bucket: FinopsArea;
  service: string;
};

/** Findings materializados por Business ETL desde Komiser (checkId komiser-*). */
function isKomiserFinding(f: FindingLike): boolean {
  const check = (f.checkId ?? '').toLowerCase();
  return check.startsWith('komiser-') || check.includes('komiser');
}

/** Servicio AWS desde checkId `komiser-ecr-cost` o friendly area. */
function komiserServiceOf(f: FindingLike, fallback = 'AWS'): string {
  const check = (f.checkId ?? '').toLowerCase();
  const m = /^komiser-(.+)-cost$/.exec(check);
  if (m?.[1]) {
    return m[1].replace(/-/g, ' ').toUpperCase();
  }
  const area = (f.friendlyArea ?? f.friendlyAreaEs ?? '').trim();
  if (area && !/^inventario|inventory|costos|cost$/i.test(area)) {
    return area.split('·')[0]!.trim();
  }
  return fallback;
}

/** Formato de ahorro: micro-montos no deben verse como $0.00. */
function formatSavingsUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  if (amount < 0.01) return '< $0.01';
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function chartUsd(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amount < 0.01) return Math.round(amount * 1e4) / 1e4;
  return Math.round(amount * 100) / 100;
}

/** Hallazgos de costo. domain/COST_* ganan; solo se bloquea SecOps claro (secrets/IAM/SG/CVE). */
function isFinopsFinding(f: FindingLike): boolean {
  const check = (f.checkId ?? '').toLowerCase();
  const category = (f.category ?? '').toLowerCase();
  const domain = (f.domain ?? '').toLowerCase();
  const title = (f.title ?? '').toLowerCase();
  const hay = `${check} ${category} ${title}`;

  const isSecurityNoise =
    /no_secrets_in_code|secrets_in_code|hardcoded.?secret|iam_user_mfa|user_mfa|root_mfa|securitygroup_allow|ingress_from_internet|ssh_open|rdp_open|cve-|trivy|sec_vulnerability|sec_iam|sec_network/.test(
      hay,
    ) || category.startsWith('sec_');

  // Señales fuertes de costo (aunque el checkId diga prowler-aws-cloudwatch_…)
  if (domain === 'finops' || category.startsWith('cost_')) {
    return !isSecurityNoise;
  }

  if (domain === 'secops' || isSecurityNoise) return false;

  if ((f.estimatedMonthlySavingsUsd ?? 0) > 0) return true;

  if (isKomiserFinding(f) || /komiser/.test(hay)) return true;

  return /rightsiz|orphan|unattached|eip|infracost|waste|retention|moderniz|ebs_unused|idle|underutil|sobredimension|graviton|log_group|serverless_waste|cost_/.test(
    hay,
  );
}

function finopsBucket(f: FindingLike): FinopsArea {
  if (isKomiserFinding(f)) return 'inventory';
  const hay = `${f.category} ${f.title} ${f.checkId ?? ''}`.toLowerCase();
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
            {{ formatMoney(filteredSavings()) }}
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
            {{ formatMoney(bucketSavings().rightsizing) }}/{{
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
            {{ formatMoney(bucketSavings().modernization) }}/{{
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
            {{ formatMoney(bucketSavings().orphaned) }}/{{
              locale.isEn() ? 'mo' : 'mes'
            }}
          </div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Inventory (Komiser)' : 'Inventario (Komiser)' }}
          </div>
          <div class="ta-kpi__value">{{ bucketCounts().inventory }}</div>
          <div class="ta-kpi__hint">
            {{ formatMoney(bucketSavings().inventory) }}/{{
              locale.isEn() ? 'mo' : 'mes'
            }}
            · {{ komiserServiceCount() }}
            {{ locale.isEn() ? 'services' : 'servicios' }}
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

      <!-- Charts: savings + Komiser inventory when present -->
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

      @if (komiserCards().length > 0 && (tab() === 'all' || tab() === 'inventory')) {
        <div class="ta-dash-section-head">
          <h2 class="ta-card__title" style="margin:0">
            {{
              locale.isEn()
                ? 'Inventory spend (Komiser)'
                : 'Gasto del inventario (Komiser)'
            }}
          </h2>
          <span class="ta-meta">
            {{ komiserCards().length }}
            {{ locale.isEn() ? 'priced resources' : 'recursos con precio' }}
            · {{ formatMoney(komiserSpend()) }} USD/{{ locale.isEn() ? 'mo' : 'mes' }}
          </span>
        </div>
        <div class="ta-chart-grid ta-chart-grid--finops">
          <div class="ta-card">
            <h2 class="ta-card__title">
              {{ locale.isEn() ? 'Spend by service' : 'Gasto por servicio' }}
            </h2>
            <ta-echart [options]="komiserServiceDonutOpt()" height="280px" />
          </div>
          <div class="ta-card ta-card--chart-wide">
            <h2 class="ta-card__title">
              {{ locale.isEn() ? 'Top inventory costs' : 'Mayores costos del inventario' }}
            </h2>
            <ta-echart [options]="komiserTopBarOpt()" height="280px" />
          </div>
        </div>
      }

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
                      {{ formatMoney(card.finding.estimatedMonthlySavingsUsd) }}
                      USD/{{ locale.isEn() ? 'mo' : 'mes' }}
                    </span>
                  } @else if ((card.finding.category || '').toUpperCase().startsWith('COST_')) {
                    ·
                    <span class="ta-meta">
                      {{
                        locale.isEn()
                          ? 'negligible storage $ (real size)'
                          : 'costo de storage insignificante (tamaño real)'
                      }}
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
      { id: 'inventory' as const, label: en ? 'Inventory' : 'Inventario' },
    ];
  });

  readonly cards = computed((): FinopsCard[] => {
    const lang = this.locale.lang();
    const rows: FinopsCard[] = [];
    for (const f of this.audit.findings()) {
      if (!isFinopsFinding(f as FindingLike)) continue;
      const ui = humanizeFinding(f as FindingLike, lang);
      // PASS de seguridad no aplica; hallazgos de costo con copy “OK” sí se listan si hay $ 
      if (
        ui.isHealthy &&
        !(f.estimatedMonthlySavingsUsd > 0 || (f.category || '').toUpperCase().startsWith('COST_'))
      ) {
        continue;
      }
      const bucket = finopsBucket(f as FindingLike);
      rows.push({
        finding: f,
        ui,
        bucket,
        service:
          bucket === 'inventory'
            ? komiserServiceOf(f as FindingLike, ui.serviceLabel || 'AWS')
            : ui.serviceLabel || ui.areaLabel.split('·')[0]?.trim() || 'AWS',
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

  readonly komiserCards = computed(() =>
    this.cards().filter((c) => c.bucket === 'inventory'),
  );

  readonly komiserSpend = computed(() =>
    this.komiserCards().reduce(
      (acc, c) => acc + (c.finding.estimatedMonthlySavingsUsd || 0),
      0,
    ),
  );

  readonly komiserServiceCount = computed(() => {
    const set = new Set(this.komiserCards().map((c) => c.service));
    return set.size;
  });

  readonly filteredSavings = computed(() =>
    this.filteredCards().reduce(
      (acc, c) => acc + (c.finding.estimatedMonthlySavingsUsd || 0),
      0,
    ),
  );

  readonly filteredAnnualSavings = computed(() => this.filteredSavings() * 12);

  readonly bucketCounts = computed(() => {
    const c = {
      rightsizing: 0,
      modernization: 0,
      orphaned: 0,
      inventory: 0,
    };
    for (const card of this.cards()) c[card.bucket] += 1;
    return c;
  });

  readonly bucketSavings = computed(() => {
    const c = {
      rightsizing: 0,
      modernization: 0,
      orphaned: 0,
      inventory: 0,
    };
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
          value: chartUsd(c.finding.estimatedMonthlySavingsUsd),
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
          value: chartUsd(s.rightsizing),
        },
        {
          name: en ? 'Modernize' : 'Moderniz.',
          value: chartUsd(s.modernization),
        },
        {
          name: en ? 'Idle' : 'Sin uso',
          value: chartUsd(s.orphaned),
        },
        {
          name: en ? 'Inventory' : 'Inventario',
          value: chartUsd(s.inventory),
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
        value: chartUsd(running),
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

  readonly komiserServiceDonutOpt = computed(() => {
    const en = this.locale.isEn();
    const byService = new Map<string, number>();
    for (const c of this.komiserCards()) {
      const usd = c.finding.estimatedMonthlySavingsUsd || 0;
      if (usd <= 0) continue;
      byService.set(c.service, (byService.get(c.service) ?? 0) + usd);
    }
    const rows = [...byService.entries()]
      .map(([name, value]) => ({ name, value: chartUsd(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    return namedDonutOption(
      rows,
      en ? 'No Komiser spend' : 'Sin gasto Komiser',
    );
  });

  readonly komiserTopBarOpt = computed(() =>
    savingsBarOption(
      this.komiserCards()
        .filter((c) => c.finding.estimatedMonthlySavingsUsd > 0)
        .slice(0, 8)
        .map((c) => ({
          name:
            `${c.service}: ${c.ui.where || c.finding.resourceId}`.slice(0, 36),
          value: chartUsd(c.finding.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  formatMoney(amount: number): string {
    return formatSavingsUsd(amount);
  }
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
      ? 'No cost-saving opportunities in this view. Try Inventory for Komiser spend, or Security center for risks.'
      : 'Sin oportunidades de ahorro en esta vista. Probá Inventario para gasto Komiser, o Centro de seguridad.';
  });

  serviceIcon(service: string): string {
    const s = service.toLowerCase();
    if (s.includes('lambda')) return 'pi-bolt';
    if (s.includes('s3') || s.includes('storage') || s.includes('ebs')) {
      return 'pi-database';
    }
    if (s.includes('ecr') || s.includes('ecs') || s.includes('fargate')) {
      return 'pi-box';
    }
    if (s.includes('ec2') || s.includes('network')) return 'pi-server';
    if (s.includes('cost') || s.includes('cloudwatch') || s.includes('invent')) {
      return 'pi-wallet';
    }
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
