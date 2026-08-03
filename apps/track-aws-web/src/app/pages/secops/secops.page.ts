import { NgClass } from '@angular/common';
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
import type { EChartsCoreOption } from 'echarts/core';
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';
import { StatusBadgeComponent } from '../../ui/audit/status-badge.component';
import { TaEchartComponent } from '../../ui/charts/ta-echart.component';
import {
  gaugeScoreOption,
  namedCountBarOption,
  namedDonutOption,
  severityPieOption,
  stackedCategoryBarOption,
} from '../../ui/charts/chart-options';
import {
  FriendlyFinding,
  humanizeFinding,
  type FindingLike,
} from '../../core/copy/friendly-finding';
import { UiLocaleService } from '../../core/i18n/ui-locale.service';
import type { AuditFindingView } from '../../services/scan.service';

type AttackTab = 'all' | 'iam' | 'network' | 'storage' | 'other';
type AttackArea = Exclude<AttackTab, 'all'>;

type SecOpsCard = {
  finding: AuditFindingView;
  ui: FriendlyFinding;
  bucket: AttackArea;
  service: string;
};

@Component({
  standalone: true,
  selector: 'app-secops-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
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
    <section class="ta-page ta-page--wide ta-secops">
      <ta-page-header
        [eyebrow]="locale.isEn() ? 'Module 2' : 'Módulo 2'"
        [title]="locale.isEn() ? 'Security center' : 'Centro de seguridad'"
        [subtitle]="
          locale.isEn()
            ? 'Access, network and storage issues ranked by urgency.'
            : 'Problemas de acceso, red y almacenamiento ordenados por urgencia.'
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
        <div class="ta-kpi ta-kpi--health" [attr.data-tone]="riskTone()">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Security posture' : 'Postura de seguridad' }}
          </div>
          <div class="ta-kpi__value">{{ securityScore() }}</div>
          <div class="ta-kpi__hint">
            {{
              locale.isEn()
                ? '100 − 15 CRITICAL − 5 HIGH − 2 MEDIUM'
                : '100 − 15 CRITICAL − 5 HIGH − 2 MEDIUM'
            }}
          </div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Critical alerts' : 'Alertas críticas' }}
          </div>
          <div class="ta-kpi__value ta-kpi__value--danger">{{ counts().CRITICAL }}</div>
          <div class="ta-kpi__hint">CRITICAL</div>
        </div>
        <div class="ta-kpi">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'High severity' : 'Severidad alta' }}
          </div>
          <div class="ta-kpi__value ta-kpi__value--warn">{{ counts().HIGH }}</div>
          <div class="ta-kpi__hint">HIGH</div>
        </div>
      </div>

      <!-- KPI secondary -->
      <div class="ta-kpi-grid ta-kpi-grid--secondary">
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Open issues' : 'Problemas abiertos' }}
          </div>
          <div class="ta-kpi__value">{{ cards().length }}</div>
          <div class="ta-kpi__hint">
            {{ filteredCards().length }}
            {{ locale.isEn() ? 'in view' : 'en vista' }}
          </div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Medium' : 'Medios' }}</div>
          <div class="ta-kpi__value">{{ counts().MEDIUM }}</div>
          <div class="ta-kpi__hint">MEDIUM</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Identity / IAM' : 'Identidad / IAM' }}
          </div>
          <div class="ta-kpi__value">{{ bucketCounts().iam }}</div>
          <div class="ta-kpi__hint">IAM</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">{{ locale.isEn() ? 'Network' : 'Red' }}</div>
          <div class="ta-kpi__value">{{ bucketCounts().network }}</div>
          <div class="ta-kpi__hint">SG / ports</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Storage' : 'Almacenamiento' }}
          </div>
          <div class="ta-kpi__value">{{ bucketCounts().storage }}</div>
          <div class="ta-kpi__hint">S3 / disks</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Other controls' : 'Otros controles' }}
          </div>
          <div class="ta-kpi__value">{{ bucketCounts().other }}</div>
          <div class="ta-kpi__hint">Apps / logs</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Services hit' : 'Servicios afectados' }}
          </div>
          <div class="ta-kpi__value">{{ serviceCount() }}</div>
          <div class="ta-kpi__hint">AWS</div>
        </div>
        <div class="ta-kpi ta-kpi--compact">
          <div class="ta-kpi__label">
            {{ locale.isEn() ? 'Regions hit' : 'Regiones afectadas' }}
          </div>
          <div class="ta-kpi__value">{{ regionCount() }}</div>
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
          · {{ a.findingCount }}
          {{ locale.isEn() ? 'findings total' : 'hallazgos en total' }}
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

      <!-- Charts -->
      <div class="ta-dash-section-head">
        <h2 class="ta-card__title" style="margin:0">
          {{ locale.isEn() ? 'Security analytics' : 'Analítica de seguridad' }}
        </h2>
        <span class="ta-meta">
          {{ locale.isEn() ? 'Follows the area filter' : 'Respeta el filtro de área' }}
        </span>
      </div>
      <div class="ta-chart-grid ta-chart-grid--dash">
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Posture gauge' : 'Medidor de postura' }}
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
            {{ locale.isEn() ? 'Attack surface' : 'Superficie de ataque' }}
          </h2>
          <ta-echart [options]="bucketDonutOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Top services' : 'Top servicios' }}
          </h2>
          <ta-echart [options]="serviceBarOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Severity by area' : 'Severidad por área' }}
          </h2>
          <ta-echart [options]="severityByBucketOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Top regions' : 'Top regiones' }}
          </h2>
          <ta-echart [options]="regionBarOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Compliance signals' : 'Señales de normativa' }}
          </h2>
          <ta-echart [options]="complianceBarOpt()" height="220px" />
        </div>
        <div class="ta-card">
          <h2 class="ta-card__title">
            {{ locale.isEn() ? 'Urgency focus' : 'Foco de urgencia' }}
          </h2>
          <ta-echart [options]="urgencyDonutOpt()" height="220px" />
        </div>
      </div>

      <div class="ta-card" style="margin-top:1rem">
        <h2 class="ta-card__title">
          {{ locale.isEn() ? 'Issues to fix' : 'Problemas a corregir' }}
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
export class SecopsPageComponent implements OnInit {
  readonly audit = inject(AuditLiveService);
  readonly locale = inject(UiLocaleService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly tab = signal<AttackTab>('all');
  tabModel: AttackTab = 'all';

  readonly tabs = computed(() => {
    const en = this.locale.isEn();
    return [
      { id: 'all' as const, label: en ? 'All' : 'Todos' },
      { id: 'iam' as const, label: en ? 'Identity & access' : 'Accesos e identidad' },
      { id: 'network' as const, label: en ? 'Network' : 'Red' },
      { id: 'storage' as const, label: en ? 'Storage' : 'Almacenamiento' },
      { id: 'other' as const, label: en ? 'Other' : 'Otros' },
    ];
  });

  readonly cards = computed((): SecOpsCard[] => {
    const lang = this.locale.lang();
    const rows: SecOpsCard[] = [];
    for (const f of this.audit.findings()) {
      if (f.domain !== 'secops') continue;
      const ui = humanizeFinding(f as FindingLike, lang);
      if (ui.isHealthy) continue;
      rows.push({
        finding: f,
        ui,
        bucket: this.attackBucket(f.category, f.title, f.checkId),
        service: ui.serviceLabel || ui.areaLabel.split('·')[0]?.trim() || 'AWS',
      });
    }
    rows.sort(
      (a, b) =>
        severityRank(a.finding.severity) - severityRank(b.finding.severity),
    );
    return rows;
  });

  readonly filteredCards = computed(() => {
    const t = this.tab();
    if (t === 'all') return this.cards();
    return this.cards().filter((c) => c.bucket === t);
  });

  readonly counts = computed(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const card of this.filteredCards()) {
      const sev = card.finding.severity;
      if (sev in c) c[sev as keyof typeof c] += 1;
    }
    return c;
  });

  readonly bucketCounts = computed(() => {
    const c = { iam: 0, network: 0, storage: 0, other: 0 };
    for (const card of this.cards()) {
      if (card.bucket === 'iam') c.iam += 1;
      else if (card.bucket === 'network') c.network += 1;
      else if (card.bucket === 'storage') c.storage += 1;
      else c.other += 1;
    }
    return c;
  });

  readonly securityScore = computed(() => {
    let score = 100;
    for (const card of this.filteredCards()) {
      if (card.finding.severity === 'CRITICAL') score -= 15;
      else if (card.finding.severity === 'HIGH') score -= 5;
      else if (card.finding.severity === 'MEDIUM') score -= 2;
    }
    return Math.max(0, Math.min(100, score));
  });

  readonly riskTone = computed(() => {
    const s = this.securityScore();
    if (s >= 90) return 'good';
    if (s >= 70) return 'warn';
    return 'bad';
  });

  readonly serviceCount = computed(() => {
    const set = new Set(this.filteredCards().map((c) => c.service));
    return set.size;
  });

  readonly regionCount = computed(() => {
    const set = new Set(
      this.filteredCards()
        .map((c) => c.finding.region)
        .filter((r) => r && r !== 'global' && r !== 'unknown'),
    );
    return set.size;
  });

  readonly gaugeOpt = computed(() => gaugeScoreOption(this.securityScore()));

  readonly pieOpt = computed(() => severityPieOption(this.counts()));

  readonly bucketDonutOpt = computed((): EChartsCoreOption => {
    const en = this.locale.isEn();
    const src = this.tab() === 'all' ? this.cards() : this.filteredCards();
    const c = { iam: 0, network: 0, storage: 0, other: 0 };
    for (const card of src) {
      if (card.bucket === 'iam') c.iam += 1;
      else if (card.bucket === 'network') c.network += 1;
      else if (card.bucket === 'storage') c.storage += 1;
      else c.other += 1;
    }
    return namedDonutOption(
      [
        { name: en ? 'Identity' : 'Identidad', value: c.iam, color: '#7c3aed' },
        { name: en ? 'Network' : 'Red', value: c.network, color: '#dc2626' },
        { name: en ? 'Storage' : 'Storage', value: c.storage, color: '#2563eb' },
        { name: en ? 'Other' : 'Otros', value: c.other, color: '#0d9488' },
      ],
      en ? 'No data' : 'Sin datos',
    );
  });

  readonly serviceBarOpt = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.filteredCards()) {
      counts.set(c.service, (counts.get(c.service) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return namedCountBarOption(rows, { color: '#dc2626' });
  });

  readonly regionBarOpt = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.filteredCards()) {
      const r = c.finding.region || 'unknown';
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return namedCountBarOption(rows, { color: '#0891b2' });
  });

  readonly complianceBarOpt = computed(() => {
    const en = this.locale.isEn();
    let iso = 0;
    let soc2 = 0;
    let pci = 0;
    let none = 0;
    for (const c of this.filteredCards()) {
      const hay = `${c.finding.checkId ?? ''} ${c.finding.title} ${c.finding.rationale}`.toLowerCase();
      if (/pci|dss/.test(hay)) pci += 1;
      else if (/soc.?2|cc6/.test(hay)) soc2 += 1;
      else if (/iso.?27001|a\.8\.|cis/.test(hay)) iso += 1;
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

  readonly urgencyDonutOpt = computed(() => {
    const en = this.locale.isEn();
    const c = this.counts();
    const urgent = c.CRITICAL + c.HIGH;
    const watch = c.MEDIUM;
    const low = c.LOW + c.INFO;
    return namedDonutOption(
      [
        { name: en ? 'Fix now' : 'Corregir ya', value: urgent, color: '#dc2626' },
        { name: en ? 'Plan soon' : 'Planificar', value: watch, color: '#d97706' },
        { name: en ? 'Backlog' : 'Backlog', value: low, color: '#94a3b8' },
      ],
      en ? 'No data' : 'Sin datos',
    );
  });

  readonly severityByBucketOpt = computed(() => {
    const en = this.locale.isEn();
    const cats = [
      en ? 'Identity' : 'Identidad',
      en ? 'Network' : 'Red',
      en ? 'Storage' : 'Storage',
      en ? 'Other' : 'Otros',
    ];
    const keys: AttackArea[] = ['iam', 'network', 'storage', 'other'];
    const buckets: Record<
      AttackArea,
      { CRITICAL: number; HIGH: number; MEDIUM: number; OTHER: number }
    > = {
      iam: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, OTHER: 0 },
      network: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, OTHER: 0 },
      storage: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, OTHER: 0 },
      other: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, OTHER: 0 },
    };
    for (const c of this.filteredCards()) {
      const b = buckets[c.bucket];
      const sev = c.finding.severity;
      if (sev === 'CRITICAL' || sev === 'HIGH' || sev === 'MEDIUM') b[sev] += 1;
      else b.OTHER += 1;
    }
    return stackedCategoryBarOption(cats, [
      {
        name: 'CRITICAL',
        color: '#dc2626',
        data: keys.map((k) => buckets[k].CRITICAL),
      },
      {
        name: 'HIGH',
        color: '#d97706',
        data: keys.map((k) => buckets[k].HIGH),
      },
      {
        name: 'MEDIUM',
        color: '#2563eb',
        data: keys.map((k) => buckets[k].MEDIUM),
      },
      {
        name: en ? 'Other' : 'Otros',
        color: '#94a3b8',
        data: keys.map((k) => buckets[k].OTHER),
      },
    ]);
  });

  readonly emptyHint = computed(() => {
    const en = this.locale.isEn();
    const a = this.audit.activeAudit();
    const total = this.audit.findings().length;
    if (!a) {
      return en
        ? 'No scan for this account yet. Start one from Overview.'
        : 'Todavía no hay una revisión para esta cuenta. Iniciá una desde Resumen.';
    }
    if (a.status !== 'completed') {
      return en
        ? `Active scan is still running («${a.status}»). Wait or pick another in History.`
        : `La revisión activa está en curso («${a.status}»). Esperá a que termine o elegí otra en Historial.`;
    }
    if (total === 0) {
      return en
        ? 'This scan stored no findings. Try a new scan from Overview.'
        : 'Esta revisión no dejó hallazgos guardados. Probá iniciar una nueva desde Resumen.';
    }
    return en
      ? 'No open security issues in this view. Check Cost or the Report.'
      : 'No hay problemas de seguridad en esta vista. Revisá Costos o el Informe.';
  });

  attackBucket(
    category: string,
    title: string,
    checkId: string | null,
  ): AttackArea {
    const hay = `${category} ${title} ${checkId ?? ''}`.toLowerCase();
    if (/iam|mfa|password|root|identity|user|credential|access.?key|privilege/.test(hay)) {
      return 'iam';
    }
    if (
      /sg|security.group|0\.0\.0\.0|network|port|ssh|rdp|nacl|vpc|firewall/.test(hay)
    ) {
      return 'network';
    }
    if (/s3|bucket|storage|public.access|ebs|efs|encryption/.test(hay)) {
      return 'storage';
    }
    return 'other';
  }

  serviceIcon(service: string): string {
    const s = service.toLowerCase();
    if (s.includes('lambda')) return 'pi-bolt';
    if (s.includes('s3') || s.includes('storage')) return 'pi-database';
    if (s.includes('ec2') || s.includes('network') || s.includes('red')) return 'pi-server';
    if (s.includes('iam') || s.includes('access') || s.includes('identidad')) {
      return 'pi-lock';
    }
    return 'pi-shield';
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
