import { Injectable, computed, inject, signal } from '@angular/core';
import { generateClient } from 'aws-amplify/api';
import { authenticatedAppsyncOptions } from '../core/auth/appsync-auth.util';
import { AuthService } from '../core/auth/auth.service';
import type { FindingView, SavingsDossierView } from './scan.service';

export type RealtimeConnectionState = 'idle' | 'connecting' | 'live' | 'error';

export interface ScanStatusChangedView {
  tenantId: string;
  scanId: string;
  accountId: string;
  status: string;
  findingCount: number;
  estimatedMonthlySavingsUsd: number;
}

export interface AuditStatusChangedView {
  tenantId: string;
  auditId: string;
  accountId: string;
  status: string;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  globalScore: number;
  estimatedMonthlySavingsUsd: number;
}

export interface FindingReadyView {
  tenantId: string;
  scanId: string;
  findingId: string;
  category: string;
  estimatedMonthlySavingsUsd: number;
  title: string;
}

export interface DossierReadyView {
  tenantId: string;
  dossierId: string;
  scanId: string;
  title: string;
  totalEstimatedMonthlySavingsUsd: number;
}

const ON_SCAN_STATUS_CHANGED = /* GraphQL */ `
  subscription OnScanStatusChanged($tenantId: ID!, $scanId: ID) {
    onScanStatusChanged(tenantId: $tenantId, scanId: $scanId) {
      tenantId
      scanId
      accountId
      status
      findingCount
      estimatedMonthlySavingsUsd
    }
  }
`;

const ON_AUDIT_STATUS_CHANGED = /* GraphQL */ `
  subscription OnAuditStatusChanged($tenantId: ID!, $auditId: ID) {
    onAuditStatusChanged(tenantId: $tenantId, auditId: $auditId) {
      tenantId
      auditId
      accountId
      status
      findingCount
      criticalCount
      highCount
      globalScore
      estimatedMonthlySavingsUsd
    }
  }
`;

const ON_FINDING_READY = /* GraphQL */ `
  subscription OnFindingReady($tenantId: ID!, $scanId: ID) {
    onFindingReady(tenantId: $tenantId, scanId: $scanId) {
      tenantId
      scanId
      findingId
      category
      estimatedMonthlySavingsUsd
      title
    }
  }
`;

const ON_DOSSIER_READY = /* GraphQL */ `
  subscription OnDossierReady($tenantId: ID!, $scanId: ID) {
    onDossierReady(tenantId: $tenantId, scanId: $scanId) {
      tenantId
      dossierId
      scanId
      title
      totalEstimatedMonthlySavingsUsd
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class AppSyncRealtimeService {
  private readonly auth = inject(AuthService);
  private readonly client = generateClient();

  private readonly _scanStatus = signal<ScanStatusChangedView | null>(null);
  private readonly _auditStatus = signal<AuditStatusChangedView | null>(null);
  private readonly _liveFindings = signal<FindingReadyView[]>([]);
  private readonly _latestDossier = signal<DossierReadyView | null>(null);
  private readonly _connectionState = signal<RealtimeConnectionState>('idle');
  private readonly _lastError = signal<string | null>(null);

  private handles: Array<{ unsubscribe: () => void }> = [];
  private activeKey: string | null = null;

  readonly scanStatus = computed(() => this._scanStatus());
  readonly auditStatus = computed(() => this._auditStatus());
  readonly liveFindings = computed(() => this._liveFindings());
  readonly latestDossier = computed(() => this._latestDossier());
  readonly connectionState = computed(() => this._connectionState());
  readonly isLive = computed(() => this._connectionState() === 'live');
  readonly lastError = computed(() => this._lastError());
  readonly liveFindingsCount = computed(() => this._liveFindings().length);
  readonly estimatedSavingsUsd = computed(() =>
    this._liveFindings().reduce((sum, f) => sum + f.estimatedMonthlySavingsUsd, 0),
  );

  ensureConnected(
    tenantId?: string | null,
    options?: { scanId?: string | null; auditId?: string | null },
  ): void {
    const tid = tenantId ?? this.auth.tenantId();
    if (!tid) return;

    const scanId = options?.scanId ?? null;
    const auditId = options?.auditId ?? null;
    const key = `${tid}:scan=${scanId ?? '*'}:audit=${auditId ?? '*'}`;
    if (this.handles.length && this.activeKey === key) return;

    this.disconnect();
    this.activeKey = key;
    this._connectionState.set('connecting');
    this._lastError.set(null);
    this._liveFindings.set([]);
    this._latestDossier.set(null);
    this._scanStatus.set(null);
    this._auditStatus.set(null);

    void authenticatedAppsyncOptions()
      .then((authOptions) => {
        const scanVars = { tenantId: tid, scanId };
        const auditVars = { tenantId: tid, auditId };

        this.subscribe(ON_SCAN_STATUS_CHANGED, scanVars, authOptions, (data) => {
          const event = (data as { onScanStatusChanged?: ScanStatusChangedView })
            .onScanStatusChanged;
          if (event) this._scanStatus.set(event);
        });

        this.subscribe(ON_AUDIT_STATUS_CHANGED, auditVars, authOptions, (data) => {
          const event = (data as { onAuditStatusChanged?: AuditStatusChangedView })
            .onAuditStatusChanged;
          if (event) this._auditStatus.set(event);
        });

        this.subscribe(ON_FINDING_READY, scanVars, authOptions, (data) => {
          const event = (data as { onFindingReady?: FindingReadyView }).onFindingReady;
          if (!event) return;
          this._liveFindings.update((prev) => {
            if (prev.some((f) => f.findingId === event.findingId)) return prev;
            return [event, ...prev].slice(0, 100);
          });
        });

        this.subscribe(ON_DOSSIER_READY, scanVars, authOptions, (data) => {
          const event = (data as { onDossierReady?: DossierReadyView }).onDossierReady;
          if (event) this._latestDossier.set(event);
        });

        this._connectionState.set('live');
      })
      .catch((err) => {
        this._connectionState.set('error');
        this._lastError.set(err instanceof Error ? err.message : String(err));
      });
  }

  seedFindings(findings: FindingView[]): void {
    this._liveFindings.set(
      findings.map((f) => ({
        tenantId: f.tenantId,
        scanId: f.scanId,
        findingId: f.findingId,
        category: f.category,
        estimatedMonthlySavingsUsd: f.estimatedMonthlySavingsUsd,
        title: f.title,
      })),
    );
  }

  seedDossier(dossier: SavingsDossierView | null): void {
    if (!dossier) {
      this._latestDossier.set(null);
      return;
    }
    this._latestDossier.set({
      tenantId: dossier.tenantId,
      dossierId: dossier.dossierId,
      scanId: dossier.scanId,
      title: dossier.title,
      totalEstimatedMonthlySavingsUsd: dossier.totalEstimatedMonthlySavingsUsd,
    });
  }

  disconnect(): void {
    for (const h of this.handles) {
      try {
        h.unsubscribe();
      } catch {
        // ignore
      }
    }
    this.handles = [];
    this.activeKey = null;
    this._connectionState.set('idle');
  }

  private subscribe(
    query: string,
    variables: Record<string, unknown>,
    authOptions: { authMode: 'userPool'; authToken: string },
    onData: (data: unknown) => void,
  ): void {
    const subscriptionObservable = this.client.graphql({
      query,
      variables,
      ...authOptions,
    });

    const handle = (
      subscriptionObservable as unknown as {
        subscribe: (observer: {
          next: (value: { data?: unknown }) => void;
          error: (err: unknown) => void;
        }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: (value) => {
        if (value.data) onData(value.data);
      },
      error: (err) => {
        this._connectionState.set('error');
        this._lastError.set(err instanceof Error ? err.message : String(err));
      },
    });

    this.handles.push(handle);
  }
}
