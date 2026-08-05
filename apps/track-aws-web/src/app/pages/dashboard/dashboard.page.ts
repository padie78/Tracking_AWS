import { DecimalPipe, NgClass, UpperCasePipe } from '@angular/common';
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
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import type { EChartsCoreOption } from 'echarts/core';
import { AuthService } from '../../core/services/auth.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import {
  gaugeScoreOption,
  namedCountBarOption,
  namedDonutOption,
  savingsBarOption,
  scoreTrendOption,
  severityPieOption,
  stackedCategoryBarOption,
  wafRadarOption,
} from '../../ui/charts/chart-options';
import {
  FriendlyFinding,
  humanizeFinding,
  type FindingLike,
} from '../../core/copy/friendly-finding';
import { UiLocaleService } from '../../core/i18n/ui-locale.service';
import type { AuditFindingView } from '../../services/scan.service';

type ComplianceKey = 'iso' | 'soc2' | 'pci';
type DomainKey = 'secops' | 'finops' | 'architecture';
type SpeedKey = 'all' | '5' | '15' | '30';
type SavingsKey = 'all' | 'with' | 'without';
type SortKey =
  | 'severity_asc'
  | 'severity_desc'
  | 'savings_desc'
  | 'savings_asc'
  | 'service_asc'
  | 'fix_asc'
  | 'title_asc';

type ActionCard = {
  finding: AuditFindingView;
  ui: FriendlyFinding;
  service: string;
  complianceBadge: string | null;
  complianceKey: ComplianceKey | null;
  timeToFix: string;
  fixMinutes: number;
  rollbackRisk: string;
  audience: string;
  isCost: boolean;
  detailLink: string;
  searchBlob: string;
};

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    DecimalPipe,
    NgClass,
    UpperCasePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DropdownModule,
    InputTextModule,
    MultiSelectModule,
    TaEchartComponent,
    PageHeaderComponent,
  ],
  template: `
    <section class="ta-page ta-page--wide ta-dash">
      <ta-page-header
        [eyebrow]="locale.isEn() ? 'Module 1' : 'Módulo 1'"
        [title]="locale.isEn() ? 'Cloud health overview' : 'Resumen de salud de tu nube'"
        [subtitle]="
          locale.isEn()
            ? 'Simple scores, savings and a short to-do list — no AWS jargon.'
            : 'Puntuación, ahorro y una lista corta de tareas — sin jerga de AWS.'
        "
      >
        <button
          pButton
          type="button"
          icon="pi pi-play"
          [label]="
            audit.starting()
              ? locale.isEn()
                ? 'Starting…'
                : 'Iniciando…'
              : audit.isRunning()
                ? locale.isEn()
                  ? 'Scanning…'
                  : 'Revisando…'
                : locale.isEn()
                  ? 'Start scan'
                  : 'Iniciar revisión'
          "
          [disabled]="audit.starting() || !canStart()"
          (click)="start()"
        ></button>
        <button
          pButton
          type="button"
          class="p-button-outlined"
          icon="pi pi-box"
          [label]="
            audit.starting()
              ? locale.isEn()
                ? 'Simulating…'
                : 'Simulando…'
              : locale.isEn()
                ? 'Simulate scanner'
                : 'Simular scanner'
          "
          [disabled]="audit.starting() || !canStart()"
          (click)="startMock()"
        ></button>
        <button
          pButton
          type="button"
          class="p-button-outlined"
          icon="pi pi-refresh"
          [label]="locale.isEn() ? 'Refresh' : 'Actualizar'"
          (click)="refresh()"
        ></button>
      </ta-page-header>

      <div class="ta-dash__context">
        <div class="ta-dash__chip">
          <span class="ta-dash__chip-label">{{ locale.isEn() ? 'Tenant' : 'Cliente' }}</span>
          <strong>{{ auth.tenantId() || '—' }}</strong>
        </div>
        <div class="ta-dash__chip">
          <span class="ta-dash__chip-label">{{ locale.isEn() ? 'AWS account' : 'Cuenta AWS' }}</span>
          <strong>{{ tenant.activeAccountId() || (locale.isEn() ? 'None' : 'Sin cuenta') }}</strong>
        </div>
        <div class="ta-dash__chip ta-dash__chip--muted">
          <span class="ta-dash__chip-label">{{ locale.isEn() ? 'Language' : 'Idioma' }}</span>
          <strong>{{ locale.lang() | uppercase }}</strong>
          <span class="ta-meta">{{ locale.isEn() ? '(header switch)' : '(selector del header)' }}</span>
        </div>
      </div>

      @if (audit.error()) {
        <div class="ta-error" style="margin-bottom:1rem">{{ audit.error() }}</div>
      }

      <!-- KPI hero -->
      <div class="ta-kpi-grid ta-kpi-grid--hero" style="margin-top:0.25rem">
        <div class="ta-kpi ta-kpi--health" [attr.data-tone]="healthTone()">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Health score' : 'Puntaje de salud' }}
          </div>
          <div class="ta-kpi__value">{{ healthScore() }}</div>
          <div class="ta-kpi__hint">
            {{
              locale.isEn()
                ? 'Starts at 100 · −15 CRITICAL · −5 HIGH'
                : 'Parte de 100 · −15 CRITICAL · −5 HIGH'
            }}
          </div>
        </div>
        <div class="ta-kpi ta-kpi--savings">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Monthly savings potential' : 'Potencial de ahorro mensual' }}
          </div>
          <div class="ta-kpi__value ta-kpi__value--accent">
            \${{ filteredSavings() | number: '1.2-2' }}
          </div>
          <div class="ta-kpi__hint">USD / {{ locale.isEn() ? 'month' : 'mes' }}</div>
        </div>
        <div class="ta-kpi ta-kpi--critical">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Active critical alerts' : 'Alertas críticas activas' }}
          </div>
          <div class="ta-kpi__value ta-kpi__value--danger">{{ filteredCritical() }}</div>
          <div class="ta-kpi__hint">
            {{ filteredHigh() }}
            {{ locale.isEn() ? 'HIGH also open' : 'HIGH también abiertas' }}
          </div>
        </div>
      </div>

      <!-- KPI secondary -->
      <div class="ta-kpi-grid ta-kpi-grid--secondary">
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Open tasks' : 'Tareas abiertas' }}</div>
          <div class="ta-kpi__value">{{ filteredActions().length }}</div>
          <div class="ta-kpi__hint">
            {{ actionCards().length }}
            {{ locale.isEn() ? 'total in scan' : 'total en la revisión' }}
          </div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'High severity' : 'Severidad alta' }}</div>
          <div class="ta-kpi__value">{{ filteredHigh() }}</div>
          <div class="ta-kpi__hint">HIGH</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Quick wins' : 'Victorias rápidas' }}</div>
          <div class="ta-kpi__value">{{ filteredQuickWins() }}</div>
          <div class="ta-kpi__hint">≤ 15 {{ locale.isEn() ? 'min' : 'min' }}</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Annual savings' : 'Ahorro anual' }}</div>
          <div class="ta-kpi__value ta-kpi__value--accent">
            \${{ filteredAnnualSavings() | number: '1.0-0' }}
          </div>
          <div class="ta-kpi__hint">USD / {{ locale.isEn() ? 'year' : 'año' }}</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Security alerts' : 'Alertas de seguridad' }}</div>
          <div class="ta-kpi__value">{{ filteredSecops() }}</div>
          <div class="ta-kpi__hint">SecOps</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Cost findings' : 'Hallazgos de costo' }}</div>
          <div class="ta-kpi__value">{{ filteredFinops() }}</div>
          <div class="ta-kpi__hint">FinOps</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Services hit' : 'Servicios afectados' }}</div>
          <div class="ta-kpi__value">{{ filteredServiceCount() }}</div>
          <div class="ta-kpi__hint">AWS</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Compliance linked' : 'Con normativa' }}</div>
          <div class="ta-kpi__value">{{ filteredComplianceLinked() }}</div>
          <div class="ta-kpi__hint">ISO · SOC 2 · PCI</div>
        </div>
      </div>

      <!-- Filters / search / sort -->
      <div class="ta-filter-board">
        <div class="ta-filter-board__search">
          <span class="p-input-icon-left" style="width:100%">
            <i class="pi pi-search"></i>
            <input
              pInputText
              type="search"
              class="ta-filter-board__search-input"
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              [placeholder]="
                locale.isEn()
                  ? 'Search alerts, resource, service…'
                  : 'Buscar alerta, recurso, servicio…'
              "
            />
          </span>
        </div>

        <div class="ta-filter-board__grid">
          <div class="ta-filter-field">
            <label>{{ locale.isEn() ? 'Alert type' : 'Tipo de alerta' }}</label>
            <p-multiSelect
              [options]="severityOptions()"
              [ngModel]="selectedSeverities()"
              (ngModelChange)="selectedSeverities.set($event)"
              optionLabel="label"
              optionValue="value"
              [placeholder]="locale.isEn() ? 'All severities' : 'Todas las severidades'"
              [showClear]="true"
              display="chip"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
          </div>

          <div class="ta-filter-field">
            <label>{{ locale.isEn() ? 'Compliance' : 'Normativa' }}</label>
            <p-multiSelect
              [options]="complianceOptions()"
              [ngModel]="selectedCompliance()"
              (ngModelChange)="selectedCompliance.set($event)"
              optionLabel="label"
              optionValue="value"
              [placeholder]="locale.isEn() ? 'All frameworks' : 'Todas las normativas'"
              [showClear]="true"
              display="chip"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
          </div>

          <div class="ta-filter-field">
            <label>{{ locale.isEn() ? 'Fix time' : 'Tiempo de solución' }}</label>
            <p-dropdown
              [options]="speedOptions()"
              [ngModel]="speed()"
              (ngModelChange)="speed.set($event)"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
          </div>

          <div class="ta-filter-field">
            <label>{{ locale.isEn() ? 'Area' : 'Área' }}</label>
            <p-multiSelect
              [options]="domainOptions()"
              [ngModel]="selectedDomains()"
              (ngModelChange)="selectedDomains.set($event)"
              optionLabel="label"
              optionValue="value"
              [placeholder]="locale.isEn() ? 'Security & cost' : 'Seguridad y costos'"
              [showClear]="true"
              display="chip"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
          </div>

          <div class="ta-filter-field">
            <label>{{ locale.isEn() ? 'AWS service' : 'Servicio AWS' }}</label>
            <p-multiSelect
              [options]="serviceOptions()"
              [ngModel]="selectedServices()"
              (ngModelChange)="selectedServices.set($event)"
              optionLabel="label"
              optionValue="value"
              [placeholder]="locale.isEn() ? 'All services' : 'Todos los servicios'"
              [showClear]="true"
              [filter]="true"
              display="chip"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
          </div>

          <div class="ta-filter-field">
            <label>{{ locale.isEn() ? 'Savings' : 'Ahorro' }}</label>
            <p-dropdown
              [options]="savingsOptions()"
              [ngModel]="savingsFilter()"
              (ngModelChange)="savingsFilter.set($event)"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
          </div>

          <div class="ta-filter-field">
            <label>{{ locale.isEn() ? 'Sort by' : 'Ordenar por' }}</label>
            <p-dropdown
              [options]="sortOptions()"
              [ngModel]="sortBy()"
              (ngModelChange)="sortBy.set($event)"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
          </div>
        </div>

        <div class="ta-filter-board__footer">
          <span class="ta-meta">
            {{ filteredActions().length }}
            /
            {{ actionCards().length }}
            {{ locale.isEn() ? 'tasks' : 'tareas' }}
          </span>
          <button
            pButton
            type="button"
            class="p-button-text p-button-sm"
            icon="pi pi-filter-slash"
            [label]="locale.isEn() ? 'Clear filters' : 'Limpiar filtros'"
            (click)="clearFilters()"
          ></button>
        </div>
      </div>

      <!-- Charts overview (always visible, filter-aware) -->
      <div class="ta-dash-section-head">
        <h2 class="ta-card__title" style="margin:0">
          {{ locale.isEn() ? 'Analytics overview' : 'Vista analítica' }}
        </h2>
        <span class="ta-meta">
          {{ locale.isEn() ? 'Follows current filters' : 'Respeta los filtros actuales' }}
        </span>
      </div>
      <div class="ta-chart-grid ta-chart-grid--dash">
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Health gauge' : 'Medidor de salud' }}
          </h2>
          <ta-echart [options]="gaugeOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Severity mix' : 'Mezcla de severidad' }}
          </h2>
          <ta-echart [options]="pieOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Security vs cost' : 'Seguridad vs costos' }}
          </h2>
          <ta-echart [options]="domainDonutOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Fix time mix' : 'Tiempo de solución' }}
          </h2>
          <ta-echart [options]="fixTimeOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Top services' : 'Top servicios' }}
          </h2>
          <ta-echart [options]="serviceBarOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Compliance coverage' : 'Cobertura normativa' }}
          </h2>
          <ta-echart [options]="complianceBarOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Top savings' : 'Top ahorro' }}
          </h2>
          <ta-echart [options]="barOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Severity by area' : 'Severidad por área' }}
          </h2>
          <ta-echart [options]="severityByDomainOpt()" height="220px" />
        </div>
      </div>

      <div class="ta-card" style="margin: 0 0 1.25rem">
        <h2 class="ta-card__title">
          {{ locale.isEn() ? 'Recent scan trend' : 'Tendencia de las últimas revisiones' }}
        </h2>
        <ta-echart [options]="trendOpt()" height="260px" />
      </div>

      <div class="ta-card" style="margin: 0 0 1.25rem">
        <h2 class="ta-card__title">
          {{ locale.isEn() ? 'Well-Architected pillars' : 'Pilares Well-Architected' }}
        </h2>
        <ta-echart [options]="radarOpt()" height="280px" />
      </div>

      <!-- Action cards -->
      <div class="ta-todo-head">
        <h2 class="ta-card__title" style="margin:0">
          {{ locale.isEn() ? 'What to fix now' : 'Qué conviene corregir ahora' }}
        </h2>
        <span class="ta-meta">{{ filteredActions().length }}</span>
      </div>

      @if (filteredActions().length === 0) {
        <div class="ta-empty-safe">
          <i class="pi pi-check-circle" aria-hidden="true"></i>
          <h3>
            {{
              locale.isEn()
                ? 'Your cloud looks healthy for this view'
                : 'Tu nube se ve sana en esta vista'
            }}
          </h3>
          <p>
            {{
              locale.isEn()
                ? 'No open tasks match these filters. Relax the filters or run a new scan.'
                : 'No hay tareas con estos filtros. Aflojá los filtros o iniciá una revisión nueva.'
            }}
          </p>
        </div>
      } @else {
        <div class="ta-todo-grid">
          @for (card of filteredActions(); track card.finding.findingId) {
            <article class="ta-incident" [attr.data-sev]="card.finding.severity" [attr.data-cost]="card.isCost">
              <div class="ta-incident__badges">
                <span class="ta-incident__service">
                  <i class="pi" [ngClass]="serviceIcon(card.service)" aria-hidden="true"></i>
                  {{ card.service }}
                </span>
                <span class="ta-sev" [attr.data-sev]="card.finding.severity">
                  {{ card.ui.urgencyLabel }}
                </span>
                @if (card.complianceBadge) {
                  <span class="ta-incident__compliance">{{ card.complianceBadge }}</span>
                }
              </div>

              <h3 class="ta-incident__title">{{ card.ui.headline }}</h3>
              <p class="ta-incident__desc">
                <strong>{{ locale.actionLabel() }}:</strong>
                {{ card.ui.whatToDo }}
              </p>

              <div class="ta-incident__impact" [class.ta-incident__impact--cost]="card.isCost">
                <strong>{{ locale.whyLabel() }}:</strong>
                {{ card.ui.whyItMatters }}
              </div>

              <div class="ta-incident__meta-row">
                <span>
                  <strong>{{ locale.resourceLabel() }}:</strong>
                  {{ card.ui.where }}
                </span>
                @if (card.finding.estimatedMonthlySavingsUsd > 0) {
                  <span class="ta-incident__money">
                    \${{ card.finding.estimatedMonthlySavingsUsd | number: '1.2-2' }}
                    USD/{{ locale.isEn() ? 'mo' : 'mes' }}
                  </span>
                }
              </div>

              <dl class="ta-incident__facts">
                @if (card.ui.checkLabel) {
                  <div>
                    <dt>{{ locale.isEn() ? 'Check' : 'Control' }}</dt>
                    <dd><code>{{ card.ui.checkLabel }}</code></dd>
                  </div>
                }
                @if (card.ui.technicalTitle && card.ui.technicalTitle !== card.ui.headline) {
                  <div>
                    <dt>{{ locale.isEn() ? 'Technical title' : 'Título técnico' }}</dt>
                    <dd>{{ card.ui.technicalTitle }}</dd>
                  </div>
                }
                @if (card.ui.evidence) {
                  <div>
                    <dt>{{ locale.isEn() ? 'Evidence' : 'Evidencia' }}</dt>
                    <dd>{{ card.ui.evidence }}</dd>
                  </div>
                }
                @if (card.ui.remediation) {
                  <div>
                    <dt>{{ locale.isEn() ? 'Engine remediation' : 'Remediación del motor' }}</dt>
                    <dd>{{ card.ui.remediation }}</dd>
                  </div>
                }
                @if (card.finding.category) {
                  <div>
                    <dt>{{ locale.isEn() ? 'Category' : 'Categoría' }}</dt>
                    <dd>{{ card.finding.category }} · {{ card.finding.domain }}</dd>
                  </div>
                }
                @if (card.ui.resourceRef) {
                  <div>
                    <dt>ARN / ID</dt>
                    <dd class="ta-incident__arn">{{ card.ui.resourceRef }}</dd>
                  </div>
                }
              </dl>

              <div class="ta-incident__mgmt">
                <span class="ta-mini-badge">⏳ {{ card.timeToFix }}</span>
                <span class="ta-mini-badge">{{ card.rollbackRisk }}</span>
                <span class="ta-mini-badge">{{ card.audience }}</span>
                <span class="ta-mini-badge">{{ card.ui.areaLabel }}</span>
              </div>

              <div class="ta-incident__actions">
                @if (card.ui.consoleUrl) {
                  <a
                    class="ta-incident__cta ta-incident__cta--secondary"
                    [href]="card.ui.consoleUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ locale.isEn() ? 'Open in AWS console' : 'Abrir en consola AWS' }}
                    <i class="pi pi-external-link" aria-hidden="true"></i>
                  </a>
                }
                <a class="ta-incident__cta" [routerLink]="card.detailLink">
                  {{ locale.isEn() ? 'Open fix path' : 'Ver pasos de solución' }}
                  <i class="pi pi-arrow-up-right" aria-hidden="true"></i>
                </a>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class DashboardPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantContextService);
  readonly audit = inject(AuditLiveService);
  readonly locale = inject(UiLocaleService);

  readonly searchQuery = signal('');
  readonly selectedSeverities = signal<string[]>([]);
  readonly selectedCompliance = signal<ComplianceKey[]>([]);
  readonly selectedDomains = signal<DomainKey[]>([]);
  readonly selectedServices = signal<string[]>([]);
  readonly speed = signal<SpeedKey>('all');
  readonly savingsFilter = signal<SavingsKey>('all');
  readonly sortBy = signal<SortKey>('severity_asc');

  readonly severityOptions = computed(() => {
    const en = this.locale.isEn();
    return [
      { value: 'CRITICAL', label: en ? 'Critical' : 'Crítico' },
      { value: 'HIGH', label: en ? 'High' : 'Alto' },
      { value: 'MEDIUM', label: en ? 'Medium' : 'Medio' },
      { value: 'LOW', label: en ? 'Low' : 'Bajo' },
      { value: 'INFO', label: en ? 'Info' : 'Info' },
    ];
  });

  readonly complianceOptions = computed(() => [
    { value: 'iso' as const, label: 'ISO 27001 / CIS' },
    { value: 'soc2' as const, label: 'SOC 2' },
    { value: 'pci' as const, label: 'PCI-DSS' },
  ]);

  readonly domainOptions = computed(() => {
    const en = this.locale.isEn();
    return [
      { value: 'secops' as const, label: en ? 'Security' : 'Seguridad' },
      { value: 'finops' as const, label: en ? 'Cost / FinOps' : 'Costos / FinOps' },
      { value: 'architecture' as const, label: en ? 'Architecture' : 'Arquitectura' },
    ];
  });

  readonly speedOptions = computed(() => {
    const en = this.locale.isEn();
    return [
      { value: 'all' as const, label: en ? 'Any time' : 'Cualquier tiempo' },
      { value: '5' as const, label: en ? '≤ 5 minutes' : '≤ 5 minutos' },
      { value: '15' as const, label: en ? '≤ 15 minutes' : '≤ 15 minutos' },
      { value: '30' as const, label: en ? '≤ 30 minutes' : '≤ 30 minutos' },
    ];
  });

  readonly savingsOptions = computed(() => {
    const en = this.locale.isEn();
    return [
      { value: 'all' as const, label: en ? 'All' : 'Todos' },
      { value: 'with' as const, label: en ? 'With savings' : 'Con ahorro' },
      { value: 'without' as const, label: en ? 'No savings' : 'Sin ahorro' },
    ];
  });

  readonly sortOptions = computed(() => {
    const en = this.locale.isEn();
    return [
      {
        value: 'severity_asc' as const,
        label: en ? 'Severity (critical first)' : 'Severidad (crítico primero)',
      },
      {
        value: 'severity_desc' as const,
        label: en ? 'Severity (low first)' : 'Severidad (bajo primero)',
      },
      {
        value: 'savings_desc' as const,
        label: en ? 'Savings (high → low)' : 'Ahorro (mayor → menor)',
      },
      {
        value: 'savings_asc' as const,
        label: en ? 'Savings (low → high)' : 'Ahorro (menor → mayor)',
      },
      {
        value: 'fix_asc' as const,
        label: en ? 'Fix time (fastest)' : 'Tiempo de solución (más rápido)',
      },
      {
        value: 'service_asc' as const,
        label: en ? 'Service (A–Z)' : 'Servicio (A–Z)',
      },
      {
        value: 'title_asc' as const,
        label: en ? 'Title (A–Z)' : 'Título (A–Z)',
      },
    ];
  });

  readonly actionCards = computed((): ActionCard[] => {
    const lang = this.locale.lang();
    return this.audit
      .findings()
      .map((f) => this.toCard(f, lang))
      .filter((c) => !c.ui.isHealthy);
  });

  readonly serviceOptions = computed(() => {
    const set = new Set<string>();
    for (const c of this.actionCards()) {
      if (c.service) set.add(c.service);
    }
    return [...set]
      .sort((a, b) => a.localeCompare(b))
      .map((s) => ({ value: s, label: s }));
  });

  readonly filteredActions = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const sevs = this.selectedSeverities();
    const comps = this.selectedCompliance();
    const domains = this.selectedDomains();
    const services = this.selectedServices();
    const spd = this.speed();
    const sav = this.savingsFilter();
    const sort = this.sortBy();

    let rows = this.actionCards().filter((c) => {
      if (q && !c.searchBlob.includes(q)) return false;
      if (sevs.length && !sevs.includes(c.finding.severity)) return false;
      if (comps.length && (!c.complianceKey || !comps.includes(c.complianceKey))) {
        return false;
      }
      if (domains.length) {
        const d = (c.finding.domain || 'secops') as DomainKey;
        if (!domains.includes(d)) return false;
      }
      if (services.length && !services.includes(c.service)) return false;
      if (spd !== 'all' && c.fixMinutes > Number(spd)) return false;
      if (sav === 'with' && !(c.finding.estimatedMonthlySavingsUsd > 0)) return false;
      if (sav === 'without' && c.finding.estimatedMonthlySavingsUsd > 0) return false;
      return true;
    });

    const rank: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'severity_desc':
          return (rank[b.finding.severity] ?? 9) - (rank[a.finding.severity] ?? 9);
        case 'savings_desc':
          return (
            b.finding.estimatedMonthlySavingsUsd - a.finding.estimatedMonthlySavingsUsd
          );
        case 'savings_asc':
          return (
            a.finding.estimatedMonthlySavingsUsd - b.finding.estimatedMonthlySavingsUsd
          );
        case 'fix_asc':
          return a.fixMinutes - b.fixMinutes;
        case 'service_asc':
          return a.service.localeCompare(b.service);
        case 'title_asc':
          return a.ui.headline.localeCompare(b.ui.headline);
        case 'severity_asc':
        default:
          return (
            (rank[a.finding.severity] ?? 9) - (rank[b.finding.severity] ?? 9) ||
            b.finding.estimatedMonthlySavingsUsd - a.finding.estimatedMonthlySavingsUsd
          );
      }
    });

    return rows;
  });

  readonly healthScore = computed(() => {
    let score = 100;
    for (const c of this.filteredActions()) {
      if (c.finding.severity === 'CRITICAL') score -= 15;
      else if (c.finding.severity === 'HIGH') score -= 5;
    }
    return Math.max(0, Math.min(100, score));
  });

  readonly healthTone = computed(() => {
    const s = this.healthScore();
    if (s >= 90) return 'good';
    if (s >= 70) return 'warn';
    return 'bad';
  });

  readonly filteredSavings = computed(() =>
    this.filteredActions().reduce(
      (acc, c) => acc + (c.finding.estimatedMonthlySavingsUsd || 0),
      0,
    ),
  );

  readonly filteredCritical = computed(
    () => this.filteredActions().filter((c) => c.finding.severity === 'CRITICAL').length,
  );

  readonly filteredHigh = computed(
    () => this.filteredActions().filter((c) => c.finding.severity === 'HIGH').length,
  );

  readonly filteredQuickWins = computed(
    () => this.filteredActions().filter((c) => c.fixMinutes <= 15).length,
  );

  readonly filteredAnnualSavings = computed(() => this.filteredSavings() * 12);

  readonly filteredSecops = computed(() => {
    let n = 0;
    for (const c of this.filteredActions()) {
      const d = c.finding.domain || (c.isCost ? 'finops' : 'secops');
      if (d !== 'finops' && d !== 'architecture') n += 1;
    }
    return n;
  });

  readonly filteredFinops = computed(() => {
    let n = 0;
    for (const c of this.filteredActions()) {
      const d = c.finding.domain || (c.isCost ? 'finops' : 'secops');
      if (d === 'finops') n += 1;
    }
    return n;
  });

  readonly filteredServiceCount = computed(() => {
    const set = new Set(this.filteredActions().map((c) => c.service));
    return set.size;
  });

  readonly filteredComplianceLinked = computed(
    () => this.filteredActions().filter((c) => !!c.complianceKey).length,
  );

  readonly gaugeOpt = computed(() => gaugeScoreOption(this.healthScore()));

  readonly radarOpt = computed((): EChartsCoreOption => {
    const p = this.audit.activeAudit()?.pillarScores;
    return wafRadarOption(
      p ?? {
        operationalExcellence: 0,
        security: 0,
        reliability: 0,
        performanceEfficiency: 0,
        costOptimization: 0,
        sustainability: 0,
      },
    );
  });

  readonly pieOpt = computed(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const c of this.filteredActions()) {
      if (c.finding.severity in counts) {
        counts[c.finding.severity as keyof typeof counts] += 1;
      }
    }
    return severityPieOption(counts);
  });

  readonly domainDonutOpt = computed(() => {
    const en = this.locale.isEn();
    let sec = 0;
    let fin = 0;
    let arch = 0;
    for (const c of this.filteredActions()) {
      const d = c.finding.domain || (c.isCost ? 'finops' : 'secops');
      if (d === 'finops') fin += 1;
      else if (d === 'architecture') arch += 1;
      else sec += 1;
    }
    return namedDonutOption(
      [
        { name: en ? 'Security' : 'Seguridad', value: sec, color: '#dc2626' },
        { name: en ? 'Cost' : 'Costos', value: fin, color: '#0d9488' },
        { name: en ? 'Architecture' : 'Arquitectura', value: arch, color: '#2563eb' },
      ],
      en ? 'No data' : 'Sin datos',
    );
  });

  readonly fixTimeOpt = computed(() => {
    const en = this.locale.isEn();
    let m5 = 0;
    let m15 = 0;
    let m30 = 0;
    for (const c of this.filteredActions()) {
      if (c.fixMinutes <= 5) m5 += 1;
      else if (c.fixMinutes <= 15) m15 += 1;
      else m30 += 1;
    }
    return namedDonutOption(
      [
        { name: en ? '≤ 5 min' : '≤ 5 min', value: m5, color: '#059669' },
        { name: en ? '≤ 15 min' : '≤ 15 min', value: m15, color: '#d97706' },
        { name: en ? '30+ min' : '30+ min', value: m30, color: '#dc2626' },
      ],
      en ? 'No data' : 'Sin datos',
    );
  });

  readonly serviceBarOpt = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.filteredActions()) {
      counts.set(c.service, (counts.get(c.service) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return namedCountBarOption(rows, { color: '#2563eb' });
  });

  readonly complianceBarOpt = computed(() => {
    const en = this.locale.isEn();
    let iso = 0;
    let soc2 = 0;
    let pci = 0;
    let none = 0;
    for (const c of this.filteredActions()) {
      if (c.complianceKey === 'iso') iso += 1;
      else if (c.complianceKey === 'soc2') soc2 += 1;
      else if (c.complianceKey === 'pci') pci += 1;
      else none += 1;
    }
    return namedCountBarOption(
      [
        { name: 'ISO / CIS', value: iso },
        { name: 'SOC 2', value: soc2 },
        { name: 'PCI-DSS', value: pci },
        { name: en ? 'Unmapped' : 'Sin mapear', value: none },
      ].filter((r) => r.value > 0),
      { color: '#7c3aed' },
    );
  });

  readonly severityByDomainOpt = computed(() => {
    const en = this.locale.isEn();
    const cats = [
      en ? 'Security' : 'Seguridad',
      en ? 'Cost' : 'Costos',
      en ? 'Architecture' : 'Arquitectura',
    ];
    const buckets = {
      secops: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, OTHER: 0 },
      finops: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, OTHER: 0 },
      architecture: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, OTHER: 0 },
    };
    for (const c of this.filteredActions()) {
      const raw = c.finding.domain || (c.isCost ? 'finops' : 'secops');
      const key =
        raw === 'finops'
          ? 'finops'
          : raw === 'architecture'
            ? 'architecture'
            : 'secops';
      const sev = c.finding.severity;
      if (sev === 'CRITICAL' || sev === 'HIGH' || sev === 'MEDIUM') {
        buckets[key][sev] += 1;
      } else {
        buckets[key].OTHER += 1;
      }
    }
    return stackedCategoryBarOption(cats, [
      {
        name: 'CRITICAL',
        color: '#dc2626',
        data: [
          buckets.secops.CRITICAL,
          buckets.finops.CRITICAL,
          buckets.architecture.CRITICAL,
        ],
      },
      {
        name: 'HIGH',
        color: '#d97706',
        data: [buckets.secops.HIGH, buckets.finops.HIGH, buckets.architecture.HIGH],
      },
      {
        name: 'MEDIUM',
        color: '#2563eb',
        data: [
          buckets.secops.MEDIUM,
          buckets.finops.MEDIUM,
          buckets.architecture.MEDIUM,
        ],
      },
      {
        name: en ? 'Other' : 'Otros',
        color: '#94a3b8',
        data: [buckets.secops.OTHER, buckets.finops.OTHER, buckets.architecture.OTHER],
      },
    ]);
  });

  readonly barOpt = computed(() =>
    savingsBarOption(
      [...this.filteredActions()]
        .filter((c) => c.finding.estimatedMonthlySavingsUsd > 0)
        .sort(
          (a, b) =>
            b.finding.estimatedMonthlySavingsUsd - a.finding.estimatedMonthlySavingsUsd,
        )
        .slice(0, 12)
        .map((c) => ({
          name: c.ui.where.slice(0, 24) || c.finding.resourceId.slice(0, 24),
          value: Math.round(c.finding.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  readonly trendOpt = computed(() =>
    scoreTrendOption(
      [...this.audit.audits()]
        .reverse()
        .slice(-8)
        .map((a) => ({
          label: a.auditId.slice(0, 6),
          score: a.globalScore,
          savings: Math.round(a.estimatedMonthlySavingsUsd),
        })),
    ),
  );

  ngOnInit(): void {
    void this.audit.bootstrap();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedSeverities.set([]);
    this.selectedCompliance.set([]);
    this.selectedDomains.set([]);
    this.selectedServices.set([]);
    this.speed.set('all');
    this.savingsFilter.set('all');
    this.sortBy.set('severity_asc');
  }

  canStart(): boolean {
    return !!this.tenant.activeAccountId() && !this.audit.isRunning();
  }

  async start(): Promise<void> {
    await this.audit.startAudit();
  }

  async startMock(): Promise<void> {
    await this.audit.startMockScan();
  }

  async refresh(): Promise<void> {
    await this.audit.refreshAudits({ preferCompleted: true });
    const id = this.audit.activeAudit()?.auditId;
    if (id) await this.audit.refreshFindings(id);
  }

  serviceIcon(service: string): string {
    const s = service.toLowerCase();
    if (s.includes('lambda')) return 'pi-bolt';
    if (s.includes('s3') || s.includes('storage')) return 'pi-database';
    if (s.includes('ec2') || s.includes('network')) return 'pi-server';
    if (s.includes('iam') || s.includes('access')) return 'pi-lock';
    if (s.includes('cost') || s.includes('cloudwatch')) return 'pi-wallet';
    return 'pi-cloud';
  }

  private toCard(f: AuditFindingView, lang: 'es' | 'en'): ActionCard {
    const ui = humanizeFinding(f as FindingLike, lang);
    const hay = `${f.checkId ?? ''} ${f.title} ${f.category} ${f.rationale}`.toLowerCase();
    const compliance = detectCompliance(hay);
    const isCost = f.domain === 'finops' || f.estimatedMonthlySavingsUsd > 0;
    const service = ui.serviceLabel || ui.areaLabel.split('·')[0]?.trim() || 'AWS';
    const fixMinutes = estimateFixMinutes(f, hay);
    const timeToFix =
      lang === 'en'
        ? fixMinutes <= 5
          ? '5 mins'
          : fixMinutes <= 15
            ? '15 mins'
            : '30+ mins'
        : fixMinutes <= 5
          ? '5 min'
          : fixMinutes <= 15
            ? '15 min'
            : '30+ min';

    return {
      finding: f,
      ui,
      service,
      complianceBadge: compliance
        ? compliance.key === 'pci'
          ? 'PCI-DSS'
          : compliance.key === 'soc2'
            ? 'SOC 2'
            : 'ISO 27001 / CIS'
        : null,
      complianceKey: compliance?.key ?? null,
      timeToFix,
      fixMinutes,
      rollbackRisk: estimateRollback(hay, isCost, lang),
      audience: estimateAudience(f, lang),
      isCost,
      detailLink: isCost ? '/tabs/finops' : '/tabs/secops',
      searchBlob: [
        ui.headline,
        ui.whatToDo,
        ui.whyItMatters,
        ui.where,
        service,
        f.title,
        f.resourceId,
        f.checkId ?? '',
        f.severity,
        f.domain,
        f.category,
      ]
        .join(' ')
        .toLowerCase(),
    };
  }
}

function detectCompliance(hay: string): { key: ComplianceKey } | null {
  if (/pci|dss/.test(hay)) return { key: 'pci' };
  if (/soc.?2|cc6/.test(hay)) return { key: 'soc2' };
  if (/iso.?27001|a\.8\.|cis/.test(hay)) return { key: 'iso' };
  return null;
}

function estimateFixMinutes(f: AuditFindingView, hay: string): number {
  if (/mfa|public.access.block|api.?key|function.?url|eip|unattached/.test(hay)) {
    return 5;
  }
  if (f.severity === 'CRITICAL' || f.severity === 'HIGH') {
    return 15;
  }
  return 30;
}

function estimateRollback(hay: string, isCost: boolean, lang: 'es' | 'en'): string {
  if (isCost || /unattached|retention|eip/.test(hay)) {
    return lang === 'en' ? 'Risk: None' : 'Riesgo: Ninguno';
  }
  if (/security.?group|0\.0\.0\.0|ssh|rdp/.test(hay)) {
    return lang === 'en' ? 'Risk: Medium' : 'Riesgo: Medio';
  }
  return lang === 'en' ? 'Risk: Low' : 'Riesgo: Bajo';
}

function estimateAudience(f: AuditFindingView, lang: 'es' | 'en'): string {
  if (f.domain === 'finops') {
    return lang === 'en' ? 'For: Founder / FinOps' : 'Para: Founder / FinOps';
  }
  if (f.severity === 'CRITICAL') {
    return lang === 'en' ? 'For: SysAdmin' : 'Para: SysAdmin';
  }
  return lang === 'en' ? 'For: Business owner' : 'Para: Dueño de negocio';
}
