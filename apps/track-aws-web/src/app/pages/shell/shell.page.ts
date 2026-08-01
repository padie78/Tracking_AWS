import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
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
import { AuditLiveService } from '../../core/audit/audit-live.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ScanService } from '../../services/scan.service';
import {
  NotificationCenterComponent,
  ToastStackComponent,
} from '../../ui/notifications/notification-center.component';
import { StatusBadgeComponent } from '../../ui/audit/status-badge.component';

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
    StatusBadgeComponent,
  ],
  template: `
    <div class="ta-shell" [attr.data-role]="auth.userRole()">
      <aside class="ta-shell__nav">
        <div class="ta-brand">Track <span>AWS</span></div>
        <div class="ta-shell__identity">
          <div class="ta-shell__role">{{ roleLabel(auth.userRole()) }} · {{ navFocus() }}</div>
          @if (auth.tenantId(); as tid) {
            <div class="ta-meta">tenant {{ tid }}</div>
          }
          <div class="ta-shell__live-row">
            <span class="ta-dot" [attr.data-state]="audit.connectionState()"></span>
            <span class="ta-meta">realtime {{ audit.connectionState() }}</span>
          </div>
        </div>

        <label class="ta-account-picker ta-field">
          <span class="ta-field__label">Cuenta AWS</span>
          <select
            class="ta-select"
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
          <div class="ta-topbar__right">
            @if (audit.isRunning()) {
              <a class="ta-live-pill" routerLink="/tabs/audits">
                <span class="ta-live-pill__pulse"></span>
                Audit {{ audit.displayStatus() }} · {{ audit.progressPercent() }}%
              </a>
            } @else {
              @if (audit.activeAudit(); as a) {
                <ta-status-badge [status]="a.status" />
              }
            }
            <ta-notification-center />
          </div>
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
  readonly audit = inject(AuditLiveService);
  readonly notes = inject(NotificationService);
  private readonly scanService = inject(ScanService);
  readonly roleLabel = roleLabel;
  readonly glyph = NAV_ICON_GLYPH;

  readonly navItems = computed(() => navItemsForRole(this.auth.userRole()));
  readonly navFocus = computed(() => navFocusForRole(this.auth.userRole()));
  readonly accounts = signal<
    Awaited<ReturnType<ScanService['listAwsAccounts']>>
  >([]);

  ngOnInit(): void {
    void this.audit.bootstrap();
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
    void this.audit.refreshAudits();
  }

  async logout(): Promise<void> {
    this.notes.clear();
    await this.auth.logout();
    window.location.href = '/login';
  }
}
