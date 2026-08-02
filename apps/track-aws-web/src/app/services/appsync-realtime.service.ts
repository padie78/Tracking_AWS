import { Injectable, computed, inject, signal } from '@angular/core';
import { generateClient } from 'aws-amplify/api';
import { authenticatedAppsyncOptions } from '../core/auth/appsync-auth.util';
import { AuthService } from '../core/auth/auth.service';

export type RealtimeConnectionState = 'idle' | 'connecting' | 'live' | 'error';

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

@Injectable({ providedIn: 'root' })
export class AppSyncRealtimeService {
  private readonly auth = inject(AuthService);
  private readonly client = generateClient();

  private readonly _auditStatus = signal<AuditStatusChangedView | null>(null);
  private readonly _connectionState = signal<RealtimeConnectionState>('idle');
  private readonly _lastError = signal<string | null>(null);

  private handles: Array<{ unsubscribe: () => void }> = [];
  private activeKey: string | null = null;

  readonly auditStatus = computed(() => this._auditStatus());
  readonly connectionState = computed(() => this._connectionState());
  readonly isLive = computed(() => this._connectionState() === 'live');
  readonly lastError = computed(() => this._lastError());

  ensureConnected(
    tenantId?: string | null,
    options?: { auditId?: string | null },
  ): void {
    const tid = tenantId ?? this.auth.tenantId();
    if (!tid) return;

    const auditId = options?.auditId ?? null;
    const key = `${tid}:audit=${auditId ?? '*'}`;
    if (this.handles.length && this.activeKey === key) return;

    this.disconnect();
    this.activeKey = key;
    this._connectionState.set('connecting');
    this._lastError.set(null);
    this._auditStatus.set(null);

    void authenticatedAppsyncOptions()
      .then((authOptions) => {
        this.subscribe(
          ON_AUDIT_STATUS_CHANGED,
          { tenantId: tid, auditId },
          authOptions,
          (data) => {
            const event = (data as { onAuditStatusChanged?: AuditStatusChangedView })
              .onAuditStatusChanged;
            if (event) this._auditStatus.set(event);
          },
        );

        this._connectionState.set('live');
      })
      .catch((err) => {
        this._connectionState.set('error');
        this._lastError.set(err instanceof Error ? err.message : String(err));
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
    authOptions: Awaited<ReturnType<typeof authenticatedAppsyncOptions>>,
    onData: (data: unknown) => void,
  ): void {
    const subscriptionObservable = this.client.graphql({
      query,
      variables,
      ...authOptions,
    });

    // Amplify tipa graphql() como Promise | Observable; en subscriptions hay que castar.
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
      error: (err: unknown) => {
        this._connectionState.set('error');
        this._lastError.set(err instanceof Error ? err.message : String(err));
      },
    });

    this.handles.push(handle);
  }
}
