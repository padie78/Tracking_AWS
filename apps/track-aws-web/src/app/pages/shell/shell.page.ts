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
    <div class="ta-shell" [attr.data-role]="auth.userRole()" [class.ta-shell--nav-open]="navOpen()">
      <header class="ta-header">
        <div class="ta-header__left">
          <button
            type="button"
            class="ta-btn ta-btn--ghost ta-btn--icon ta-shell__menu-btn"
            aria-label="Abrir menú"
            [attr.aria-expanded]="navOpen()"
            aria-controls="ta-shell-nav"
            (click)="toggleNav()"
          >
            ☰
          </button>
          <a routerLink="/tabs/dashboard" class="ta-brand" (click)="closeNav()">
            Track <span>AWS</span>
          </a>
          <span class="ta-header__divider" aria-hidden="true"></span>
          <div class="ta-workspace">
            <span class="ta-workspace__label">Workspace</span>
            <strong>{{ auth.tenantId() || '—' }}</strong>
            <span class="ta-chip">{{ roleLabel(auth.userRole()) }}</span>
          </div>
        </div>

        <div class="ta-header__center">
          <label class="ta-header__search">
            <span class="ta-header__search-icon" aria-hidden="true">⌕</span>
            <select
              class="ta-select ta-select--bare"
              [ngModel]="tenant.activeAccountId() ?? ''"
              (ngModelChange)="onAccountChange($event)"
            >
              <option value="" disabled>Seleccionar cuenta AWS…</option>
              @for (a of accounts(); track a.accountId) {
                <option [value]="a.accountId">
                  {{ a.displayName || a.accountId }} · {{ a.status }}
                </option>
              }
            </select>
          </label>
        </div>

        <div class="ta-header__right">
          <div class="ta-shell__live-row">
            <span class="ta-dot" [attr.data-state]="audit.connectionState()"></span>
            <span class="ta-meta">{{ audit.connectionState() }}</span>
          </div>
          @if (audit.isRunning()) {
            <a class="ta-live-pill" routerLink="/tabs/audits" (click)="closeNav()">
              <span class="ta-live-pill__pulse"></span>
              {{ audit.displayStatus() }} · {{ audit.progressPercent() }}%
            </a>
          } @else {
            @if (audit.activeAudit(); as a) {
              <ta-status-badge [status]="a.status" />
            }
          }
          <ta-notification-center />
          <button type="button" class="ta-btn ta-btn--ghost ta-btn--sm" (click)="logout()">
            Salir
          </button>
        </div>
      </header>

      <div class="ta-shell__body">
        <button
          type="button"
          class="ta-shell__backdrop"
          [class.--open]="navOpen()"
          aria-label="Cerrar menú"
          (click)="closeNav()"
        ></button>

        <aside class="ta-shell__nav" [class.--open]="navOpen()" id="ta-shell-nav">
          <div class="ta-shell__nav-section">{{ navFocus() }}</div>
          <ul class="ta-nav-list">
            @for (item of navItems(); track item.id) {
              <li>
                <a
                  [routerLink]="item.route"
                  routerLinkActive="active"
                  [title]="item.description"
                  (click)="closeNav()"
                >
                  <span class="ta-nav-list__icon" aria-hidden="true">{{ glyph[item.icon] }}</span>
                  <span class="ta-nav-list__text">
                    <span class="ta-nav-list__label">{{ item.label }}</span>
                    <span class="ta-nav-list__desc">{{ item.description }}</span>
                  </span>
                </a>
              </li>
            }
          </ul>
        </aside>

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
  readonly navOpen = signal(false);

  readonly navItems = computed(() => navItemsForRole(this.auth.userRole()));
  readonly navFocus = computed(() => navFocusForRole(this.auth.userRole()));
  readonly accounts = signal<
    Awaited<ReturnType<ScanService['listAwsAccounts']>>
  >([]);

  ngOnInit(): void {
    void this.audit.bootstrap();
    void this.loadAccounts();
  }

  toggleNav(): void {
    this.navOpen.update((v) => !v);
  }

  closeNav(): void {
    this.navOpen.set(false);
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
    this.closeNav();
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
