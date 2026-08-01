import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  NAV_ICON_GLYPH,
  navFocusForRole,
  navItemsForRole,
} from '../../core/navigation/app-nav.config';
import { roleLabel } from '../../core/auth/user-role';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AppSyncRealtimeService } from '../../services/appsync-realtime.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ScanService } from '../../services/scan.service';
import {
  NotificationCenterComponent,
  ToastStackComponent,
} from '../../ui/notifications/notification-center.component';

@Component({
  standalone: true,
  selector: 'app-shell-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    NotificationCenterComponent,
    ToastStackComponent,
  ],
  template: `
    <div class="ta-shell" [attr.data-role]="auth.userRole()">
      <aside class="ta-shell__nav">
        <div class="ta-brand">Track <span>AWS</span></div>
        <div class="ta-meta">
          {{ roleLabel(auth.userRole()) }} · {{ navFocus() }}
          @if (auth.tenantId()) {
            <br />tenant {{ auth.tenantId() }}
          }
          <br />realtime {{ realtime.connectionState() }}
        </div>

        <label class="ta-account-picker">
          Cuenta AWS
          <select
            [ngModel]="tenant.activeAccountId() ?? ''"
            (ngModelChange)="onAccountChange($event)"
          >
            <option value="" disabled>Seleccionar…</option>
            @for (a of accounts(); track a.accountId) {
              <option [value]="a.accountId">
                {{ a.displayName || a.accountId }} ({{ a.status }})
              </option>
            }
          </select>
        </label>

        <ul class="ta-nav-list">
          @for (item of navItems(); track item.id) {
            <li>
              <a [routerLink]="item.route" routerLinkActive="active" [title]="item.description">
                <span class="ta-nav-list__icon" aria-hidden="true">{{ glyph[item.icon] }}</span>
                {{ item.label }}
              </a>
            </li>
          }
        </ul>
        <button type="button" class="ta-btn ta-btn--ghost" (click)="logout()">Salir</button>
      </aside>

      <div class="ta-shell__content">
        <header class="ta-topbar">
          <div>
            <div class="ta-topbar__title">Autonomous Cloud Audit</div>
            <div class="ta-meta">
              @if (tenant.activeAccountId(); as acct) {
                acct {{ acct }}
              } @else {
                Sin cuenta activa — configurá en Settings
              }
            </div>
          </div>
          <ta-notification-center />
        </header>
        <main class="ta-shell__main">
          <router-outlet />
        </main>
      </div>

      <ta-toast-stack />
    </div>
  `,
})
export class ShellPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly tenant = inject(TenantContextService);
  readonly realtime = inject(AppSyncRealtimeService);
  readonly notes = inject(NotificationService);
  private readonly scanService = inject(ScanService);
  readonly roleLabel = roleLabel;
  readonly glyph = NAV_ICON_GLYPH;

  readonly navItems = computed(() => navItemsForRole(this.auth.userRole()));
  readonly navFocus = computed(() => navFocusForRole(this.auth.userRole()));
  readonly accounts = signal<
    Awaited<ReturnType<ScanService['listAwsAccounts']>>
  >([]);

  private lastAuditStatusKey = '';
  private lastFindingId = '';

  constructor() {
    effect(() => {
      const st = this.realtime.auditStatus();
      if (!st) return;
      const key = `${st.auditId}:${st.status}:${st.criticalCount}:${st.findingCount}`;
      if (key === this.lastAuditStatusKey) return;
      this.lastAuditStatusKey = key;

      if (st.status === 'completed' || st.status === 'aggregating') {
        this.notes.push({
          kind: st.criticalCount > 0 ? 'critical' : 'success',
          title: `Audit ${st.status}`,
          body: `Score ${st.globalScore} · ${st.findingCount} findings · CRITICAL ${st.criticalCount} · $${st.estimatedMonthlySavingsUsd.toFixed(0)}/mes`,
          href: '/tabs/audits',
        });
      } else if (st.criticalCount > 0) {
        this.notes.push({
          kind: 'critical',
          title: 'Hallazgos CRITICAL',
          body: `${st.criticalCount} críticos en audit ${st.auditId.slice(0, 8)}…`,
          href: '/tabs/secops',
        });
      }
    });

    effect(() => {
      const findings = this.realtime.liveFindings();
      const latest = findings[0];
      if (!latest || latest.findingId === this.lastFindingId) return;
      this.lastFindingId = latest.findingId;
      this.notes.push({
        kind: latest.estimatedMonthlySavingsUsd > 0 ? 'savings' : 'info',
        title: latest.title,
        body: `${latest.category} · $${latest.estimatedMonthlySavingsUsd.toFixed(0)}/mes`,
        href: '/tabs/finops',
        toast: true,
      });
    });
  }

  ngOnInit(): void {
    const tenantId = this.auth.tenantId();
    if (tenantId) this.realtime.ensureConnected(tenantId);
    void this.loadAccounts();
  }

  async loadAccounts(): Promise<void> {
    if (!this.auth.tenantId()) return;
    try {
      const list = await this.scanService.listAwsAccounts();
      this.accounts.set(list);
      if (!this.tenant.activeAccountId() && list[0]) {
        this.tenant.setActiveAccount(list[0].accountId);
      }
    } catch {
      /* ignore */
    }
  }

  onAccountChange(accountId: string): void {
    this.tenant.setActiveAccount(accountId);
    this.notes.push({
      kind: 'info',
      title: 'Cuenta activa',
      body: `Ahora auditás ${accountId}`,
      toast: true,
    });
  }

  async logout(): Promise<void> {
    this.realtime.disconnect();
    this.notes.clear();
    await this.auth.logout();
    window.location.href = '/login';
  }
}
