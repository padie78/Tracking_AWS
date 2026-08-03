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
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { AuthService } from '../../core/services/auth.service';
import {
  NAV_ICON_CLASS,
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

type AccountOption = {
  accountId: string;
  label: string;
};

@Component({
  standalone: true,
  selector: 'app-shell-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    ButtonModule,
    DropdownModule,
    NotificationCenterComponent,
    ToastStackComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="ta-shell" [attr.data-role]="auth.userRole()" [class.ta-shell--nav-open]="navOpen()">
      <header class="ta-header">
        <div class="ta-header__left">
          <button
            pButton
            type="button"
            class="ta-shell__menu-btn p-button-outlined p-button-icon-only"
            icon="pi pi-bars"
            aria-label="Abrir menú"
            [attr.aria-expanded]="navOpen()"
            aria-controls="ta-shell-nav"
            (click)="toggleNav()"
          ></button>
          <a routerLink="/tabs/dashboard" class="ta-brand" (click)="closeNav()">
            Track <span>AWS</span>
          </a>
          <span class="ta-header__divider" aria-hidden="true"></span>
          <div class="ta-workspace">
            <span class="ta-workspace__label">Espacio</span>
            <strong>{{ auth.tenantId() || '—' }}</strong>
            <span class="ta-chip">{{ roleLabel(auth.userRole()) }}</span>
          </div>
        </div>

        <div class="ta-header__center">
          <div class="ta-header__search">
            <i class="pi pi-cloud ta-header__search-icon" aria-hidden="true"></i>
            <p-dropdown
              [options]="accountOptions()"
              [ngModel]="tenant.activeAccountId()"
              (ngModelChange)="onAccountChange($event)"
              optionLabel="label"
              optionValue="accountId"
              placeholder="Elegí una cuenta AWS…"
              [style]="{ width: '100%' }"
              [filter]="accountOptions().length > 6"
              filterPlaceholder="Buscar cuenta"
              appendTo="body"
            />
          </div>
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
          <button
            pButton
            type="button"
            label="Salir"
            icon="pi pi-sign-out"
            class="p-button-outlined p-button-sm"
            (click)="logout()"
          ></button>
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
                  <span class="ta-nav-list__icon" aria-hidden="true">
                    <i [class]="iconClass[item.icon]"></i>
                  </span>
                  <span class="ta-nav-list__text">
                    <span class="ta-nav-list__label">
                      <span class="ta-nav-list__mod">M{{ item.module }}</span>
                      {{ item.label }}
                    </span>
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
  readonly iconClass = NAV_ICON_CLASS;
  readonly navOpen = signal(false);

  readonly navItems = computed(() => navItemsForRole(this.auth.userRole()));
  readonly navFocus = computed(() => navFocusForRole(this.auth.userRole()));
  readonly accounts = signal<
    Awaited<ReturnType<ScanService['listAwsAccounts']>>
  >([]);

  readonly accountOptions = computed((): AccountOption[] =>
    this.accounts().map((a) => ({
      accountId: a.accountId,
      label: `${a.displayName || a.accountId} · ${a.status}`,
    })),
  );

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

  onAccountChange(accountId: string | null): void {
    if (!accountId) return;
    this.tenant.setActiveAccount(accountId);
    this.closeNav();
    this.notes.push({
      kind: 'info',
      title: 'Cuenta activa',
      body: `Ahora revisás ${accountId}`,
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
