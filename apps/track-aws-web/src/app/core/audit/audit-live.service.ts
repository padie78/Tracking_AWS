import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { NotificationService } from '../notifications/notification.service';
import {
  AppSyncRealtimeService,
  type AuditStatusChangedView,
} from '../../services/appsync-realtime.service';
import {
  AuditFindingView,
  AuditJobView,
  ScanService,
} from '../../services/scan.service';

const TERMINAL = new Set(['completed', 'failed']);

export type AuditStageId =
  | 'resolve'
  | 'engines'
  | 'aggregate'
  | 'done';

export type AuditStageState = 'pending' | 'active' | 'done' | 'error';

export interface AuditStage {
  id: AuditStageId;
  label: string;
  detail: string;
  state: AuditStageState;
}

@Injectable({ providedIn: 'root' })
export class AuditLiveService {
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantContextService);
  private readonly scan = inject(ScanService);
  private readonly realtime = inject(AppSyncRealtimeService);
  private readonly notes = inject(NotificationService);

  private readonly _audits = signal<AuditJobView[]>([]);
  private readonly _findings = signal<AuditFindingView[]>([]);
  private readonly _activeAuditId = signal<string | null>(null);
  private readonly _busy = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _starting = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastToastKey = '';

  readonly audits = this._audits.asReadonly();
  readonly findings = this._findings.asReadonly();
  readonly activeAuditId = this._activeAuditId.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly error = this._error.asReadonly();
  readonly starting = this._starting.asReadonly();
  readonly connectionState = this.realtime.connectionState;
  readonly liveStatus = this.realtime.auditStatus;

  readonly activeAudit = computed((): AuditJobView | null => {
    const id = this._activeAuditId();
    const list = this._audits();
    if (id) return list.find((a) => a.auditId === id) ?? null;
    return list[0] ?? null;
  });

  readonly displayStatus = computed((): string => {
    return this.liveStatus()?.status ?? this.activeAudit()?.status ?? 'idle';
  });

  readonly isRunning = computed(() => {
    const status = this.displayStatus();
    return status !== 'idle' && !TERMINAL.has(status);
  });

  readonly stages = computed((): AuditStage[] => {
    const status = this.displayStatus();
    return buildStages(status);
  });

  readonly progressPercent = computed(() => {
    const status = this.displayStatus();
    if (status === 'completed') return 100;
    if (status === 'failed') return 100;
    if (status === 'aggregating') return 82;
    if (status === 'running') return 55;
    if (status === 'assuming_role') return 22;
    if (status === 'queued') return 8;
    return 0;
  });

  constructor() {
    effect(() => {
      const st = this.realtime.auditStatus();
      if (!st) return;
      this.mergeLiveStatus(st);
      const key = `${st.auditId}:${st.status}`;
      if (key === this.lastToastKey) return;
      this.lastToastKey = key;
      if (st.status === 'completed') {
        this.notes.push({
          kind: st.criticalCount > 0 ? 'critical' : 'success',
          title: 'Audit completado',
          body: `Score ${st.globalScore} · ${st.findingCount} findings · $${st.estimatedMonthlySavingsUsd.toFixed(0)}/mes`,
          href: '/tabs/audits',
        });
        void this.refreshFindings(st.auditId);
        this.stopPolling();
      } else if (st.status === 'failed') {
        this.notes.push({
          kind: 'critical',
          title: 'Audit fallido',
          body: `Revisá Step Functions / logs · ${st.auditId.slice(0, 8)}…`,
          href: '/tabs/audits',
        });
        this.stopPolling();
      } else if (!TERMINAL.has(st.status)) {
        this.startPolling();
      }
    });
  }

  async bootstrap(): Promise<void> {
    const tenantId = this.auth.tenantId();
    if (tenantId) this.realtime.ensureConnected(tenantId);
    await this.refreshAudits();
  }

  async refreshAudits(opts?: {
    /** Prefer completed audits with findings (FinOps / SecOps / Informe). */
    preferCompleted?: boolean;
  }): Promise<void> {
    if (!this.auth.tenantId()) return;
    this._busy.set(true);
    this._error.set(null);
    try {
      const raw = await this.scan.listAudits({ limit: 50 });
      const list = sortAuditsNewestFirst(raw);
      this._audits.set(list);

      const accountId = this.tenant.activeAccountId();
      const scoped = accountId
        ? list.filter((a) => a.accountId === accountId)
        : list;
      const pool = scoped.length > 0 ? scoped : list;

      const previousId = this._activeAuditId();
      const previousStillValid =
        !!previousId && pool.some((a) => a.auditId === previousId);

      const running = pool.find((a) => !TERMINAL.has(a.status));
      const bestCompleted = pickBestCompleted(pool);

      let focus =
        opts?.preferCompleted && bestCompleted
          ? bestCompleted
          : running ??
            (previousStillValid
              ? pool.find((a) => a.auditId === previousId) ?? null
              : null) ??
            bestCompleted ??
            pool[0] ??
            null;

      // Si hay un audit en curso, no lo ocultamos salvo que pidamos completed.
      if (!opts?.preferCompleted && running) focus = running;

      if (focus) {
        this._activeAuditId.set(focus.auditId);
        const tenantId = this.auth.tenantId();
        if (tenantId) {
          this.realtime.ensureConnected(tenantId, { auditId: focus.auditId });
        }
        if (running && !opts?.preferCompleted) this.startPolling();
        else if (!running) this.stopPolling();

        if (TERMINAL.has(focus.status) || focus.findingCount > 0) {
          await this.refreshFindings(focus.auditId);
        } else {
          this._findings.set([]);
        }
      } else {
        this._activeAuditId.set(null);
        this._findings.set([]);
      }
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this._busy.set(false);
    }
  }

  async refreshFindings(auditId?: string): Promise<void> {
    const id = auditId ?? this._activeAuditId();
    if (!id) {
      this._findings.set([]);
      return;
    }
    try {
      this._findings.set(await this.scan.listAuditFindings(id));
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  selectAudit(auditId: string): void {
    this._activeAuditId.set(auditId);
    const tenantId = this.auth.tenantId();
    if (tenantId) this.realtime.ensureConnected(tenantId, { auditId });
    void this.refreshFindings(auditId).catch(() => {
      /* error ya en this._error */
    });
  }

  /** Latest completed audit for the active account (analysis pages). */
  bestCompletedAudit(): AuditJobView | null {
    const accountId = this.tenant.activeAccountId();
    const list = this._audits().filter(
      (a) => !accountId || a.accountId === accountId,
    );
    return pickBestCompleted(list.length ? list : this._audits());
  }

  async startAudit(): Promise<string | null> {
    const accountId = this.tenant.activeAccountId();
    const tenantId = this.auth.tenantId();
    if (!accountId || !tenantId) {
      this._error.set('Seleccioná una cuenta AWS activa en el selector.');
      return null;
    }

    this._starting.set(true);
    this._error.set(null);
    try {
      const result = await this.scan.startAudit({ accountId });
      this._activeAuditId.set(result.auditId);
      this.realtime.ensureConnected(tenantId, { auditId: result.auditId });
      this.notes.push({
        kind: 'info',
        title: 'Audit iniciado',
        body: `Step Functions · ${result.auditId.slice(0, 8)}…`,
        href: '/tabs/audits',
        toast: true,
      });
      // Optimistic row until first poll
      const now = new Date().toISOString();
      this._audits.update((prev) => [
        {
          tenantId,
          auditId: result.auditId,
          accountId,
          status: 'queued',
          correlationId: result.correlationId,
          createdAtIso: now,
          completedAtIso: null,
          findingCount: 0,
          criticalCount: 0,
          highCount: 0,
          estimatedMonthlySavingsUsd: 0,
          globalScore: 0,
          pillarScores: {
            operationalExcellence: 0,
            security: 0,
            reliability: 0,
            performanceEfficiency: 0,
            costOptimization: 0,
            sustainability: 0,
          },
          executionArn: result.executionArn,
          errorMessage: null,
        },
        ...prev.filter((a) => a.auditId !== result.auditId),
      ]);
      this.startPolling();
      await this.refreshAudits();
      return result.auditId;
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      this._starting.set(false);
    }
  }

  private mergeLiveStatus(st: AuditStatusChangedView): void {
    this._activeAuditId.set(st.auditId);
    this._audits.update((prev) => {
      const idx = prev.findIndex((a) => a.auditId === st.auditId);
      if (idx < 0) {
        return [
          {
            tenantId: st.tenantId,
            auditId: st.auditId,
            accountId: st.accountId,
            status: st.status,
            correlationId: '',
            createdAtIso: new Date().toISOString(),
            completedAtIso: TERMINAL.has(st.status) ? new Date().toISOString() : null,
            findingCount: st.findingCount,
            criticalCount: st.criticalCount,
            highCount: st.highCount,
            estimatedMonthlySavingsUsd: st.estimatedMonthlySavingsUsd,
            globalScore: st.globalScore,
            pillarScores: {
              operationalExcellence: 0,
              security: 0,
              reliability: 0,
              performanceEfficiency: 0,
              costOptimization: 0,
              sustainability: 0,
            },
            executionArn: null,
            errorMessage: null,
          },
          ...prev,
        ];
      }
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        status: st.status,
        findingCount: st.findingCount,
        criticalCount: st.criticalCount,
        highCount: st.highCount,
        estimatedMonthlySavingsUsd: st.estimatedMonthlySavingsUsd,
        globalScore: st.globalScore,
        completedAtIso:
          TERMINAL.has(st.status) ? new Date().toISOString() : copy[idx].completedAtIso,
      };
      return copy;
    });
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.refreshAudits();
    }, 4000);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }
}

function sortAuditsNewestFirst(list: AuditJobView[]): AuditJobView[] {
  return [...list].sort((a, b) =>
    b.createdAtIso.localeCompare(a.createdAtIso),
  );
}

function pickBestCompleted(list: AuditJobView[]): AuditJobView | null {
  const completed = list.filter((a) => a.status === 'completed');
  if (completed.length === 0) return null;
  const withFindings = completed
    .filter((a) => a.findingCount > 0)
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  if (withFindings.length > 0) return withFindings[0];
  return [...completed].sort((a, b) =>
    b.createdAtIso.localeCompare(a.createdAtIso),
  )[0];
}

function buildStages(status: string): AuditStage[] {
  const order: AuditStageId[] = ['resolve', 'engines', 'aggregate', 'done'];
  const labels: Record<AuditStageId, { label: string; detail: string }> = {
    resolve: {
      label: 'Resolve account',
      detail: 'AssumeRole + External ID',
    },
    engines: {
      label: 'Motores en paralelo',
      detail: 'CloudQuery + Prowler Fargate',
    },
    aggregate: {
      label: 'Agregar resultados',
      detail: 'Score WAF, findings y digests',
    },
    done: {
      label: 'Completado',
      detail: status === 'failed' ? 'Falló la ejecución' : 'Listo para revisar',
    },
  };

  let activeIndex = -1;
  if (status === 'queued' || status === 'assuming_role') activeIndex = 0;
  else if (status === 'running') activeIndex = 1;
  else if (status === 'aggregating') activeIndex = 2;
  else if (status === 'completed') activeIndex = 3;
  else if (status === 'failed') activeIndex = 3;

  return order.map((id, index) => {
    let state: AuditStageState = 'pending';
    if (status === 'failed' && index === activeIndex) state = 'error';
    else if (activeIndex < 0) state = 'pending';
    else if (index < activeIndex) state = 'done';
    else if (index === activeIndex) state = status === 'completed' ? 'done' : 'active';
    return { id, state, ...labels[id] };
  });
}
