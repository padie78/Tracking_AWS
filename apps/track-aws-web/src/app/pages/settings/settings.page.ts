import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import {
  LinkAwsAccountResultView,
  ScanService,
} from '../../services/scan.service';
import { AppSyncRealtimeService } from '../../services/appsync-realtime.service';

@Component({
  standalone: true,
  selector: 'app-settings-page',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule],
  template: `
    <section class="ta-page">
      <h1>Settings</h1>
      <p>
        Conectá una cuenta AWS con un rol cross-account (AssumeRole + External ID).
        Track_AWS no guarda credenciales permanentes.
      </p>

      @if (!auth.isAdmin()) {
        <div class="ta-card ta-error">Solo finops_admin puede gestionar conexiones.</div>
      } @else {
        <form class="ta-card" style="display:grid;gap:0.75rem" (ngSubmit)="connect()">
          <label>
            Account ID (12 dígitos)
            <input
              name="accountId"
              [(ngModel)]="accountId"
              pattern="\\d{12}"
              required
              placeholder="123456789012"
            />
          </label>
          <label>
            Nombre (opcional)
            <input name="displayName" [(ngModel)]="displayName" placeholder="Prod / FinOps" />
          </label>
          <label>
            Nombre del rol IAM
            <input name="roleName" [(ngModel)]="roleName" placeholder="TrackAwsScannerRole" />
          </label>
          <button class="ta-btn" type="submit" [disabled]="busy()">
            {{ busy() ? 'Conectando…' : '1. Generar External ID + plantilla' }}
          </button>
        </form>

        @if (linkResult(); as link) {
          <div class="ta-card" style="display:grid;gap:0.75rem;margin-top:1rem">
            <h2 style="margin:0;font-size:1.1rem">2. Desplegá el rol en la cuenta cliente</h2>
            <div class="ta-meta">Status: {{ link.status }}</div>
            <div class="ta-meta">Role ARN: {{ link.roleArn }}</div>
            <label>
              External ID (copiá al CFN / trust policy)
              <input [value]="link.externalId" readonly (click)="$any($event.target).select()" />
            </label>
            <div class="ta-meta">Scanner account: {{ link.scannerAccountId }}</div>
            <div class="ta-meta" style="word-break:break-all">
              Scanner role: {{ link.scannerRoleArn }}
            </div>
            <a class="ta-btn" [href]="link.cloudFormationUrl" target="_blank" rel="noopener">
              Abrir CloudFormation quick-create
            </a>
            <button
              class="ta-btn ta-btn--ghost"
              type="button"
              [disabled]="busy()"
              (click)="verify()"
            >
              {{ busy() ? 'Verificando…' : '3. Verificar AssumeRole' }}
            </button>
            <button
              class="ta-btn ta-btn--ghost"
              type="button"
              [disabled]="busy() || link.status !== 'active'"
              (click)="startAudit()"
            >
              {{ busy() ? 'Iniciando…' : '4. Start audit (Step Functions)' }}
            </button>
          </div>
        }

        @if (accounts().length) {
          <div class="ta-card" style="margin-top:1rem">
            <h2 style="margin:0 0 0.75rem;font-size:1.1rem">Cuentas vinculadas</h2>
            <ul style="margin:0;padding-left:1.1rem">
              @for (a of accounts(); track a.accountId) {
                <li>
                  <button type="button" class="ta-btn ta-btn--ghost" (click)="selectAccount(a.accountId)">
                    {{ a.displayName }} ({{ a.accountId }}) — {{ a.status }}
                  </button>
                </li>
              }
            </ul>
          </div>
        }

        <div class="ta-card" style="display:grid;gap:0.75rem;margin-top:1rem">
          <h2 style="margin:0;font-size:1.1rem">Alertas al cliente</h2>
          <p class="ta-meta" style="margin:0">
            Webhook / Slack reciben digests con seguridad, tips de ahorro e inconsistencias
            tras cada audit. Email: suscribí la dirección al topic SNS de la plataforma.
          </p>
          <label>
            Tipo
            <select name="alertKind" [(ngModel)]="alertKind">
              <option value="slack">Slack Incoming Webhook</option>
              <option value="webhook">Webhook HTTPS</option>
              <option value="email">Email (vía SNS)</option>
            </select>
          </label>
          <label>
            Destino (URL o email)
            <input name="alertTarget" [(ngModel)]="alertTarget" placeholder="https://hooks.slack.com/…" />
          </label>
          <label>
            Etiqueta
            <input name="alertLabel" [(ngModel)]="alertLabel" placeholder="Ops Slack" />
          </label>
          <button class="ta-btn" type="button" [disabled]="busy()" (click)="saveAlert()">
            Guardar canal
          </button>
          @if (alertChannels().length) {
            <ul style="margin:0;padding-left:1.1rem">
              @for (c of alertChannels(); track c.channelId) {
                <li>
                  {{ c.label }} · {{ c.kind }} · {{ c.target }}
                  <button type="button" class="ta-btn ta-btn--ghost" (click)="removeAlert(c.channelId)">
                    Eliminar
                  </button>
                </li>
              }
            </ul>
          }
        </div>

        @if (lastScanId()) {
          <div class="ta-meta" style="margin-top:0.75rem">Último scanId: {{ lastScanId() }}</div>
        }
        @if (error()) {
          <div class="ta-error" style="margin-top:0.75rem">{{ error() }}</div>
        }
      }
    </section>
  `,
})
export class SettingsPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantContextService);
  private readonly scanService = inject(ScanService);
  private readonly realtime = inject(AppSyncRealtimeService);

  accountId = this.tenant.activeAccountId() ?? '';
  displayName = '';
  roleName = 'TrackAwsScannerRole';
  alertKind: 'webhook' | 'slack' | 'email' = 'slack';
  alertTarget = '';
  alertLabel = 'Ops';

  readonly linkResult = signal<LinkAwsAccountResultView | null>(null);
  readonly accounts = signal<
    Awaited<ReturnType<ScanService['listAwsAccounts']>>
  >([]);
  readonly alertChannels = signal<
    Awaited<ReturnType<ScanService['listAlertChannels']>>
  >([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastScanId = signal<string | null>(null);

  ngOnInit(): void {
    void this.refreshAccounts();
    void this.refreshAlerts();
  }

  selectAccount(accountId: string): void {
    this.accountId = accountId;
    this.tenant.setActiveAccount(accountId);
  }

  async refreshAccounts(): Promise<void> {
    if (!this.auth.tenantId()) return;
    try {
      this.accounts.set(await this.scanService.listAwsAccounts());
    } catch {
      /* ignore list errors on load */
    }
  }

  async refreshAlerts(): Promise<void> {
    if (!this.auth.tenantId()) return;
    try {
      this.alertChannels.set(await this.scanService.listAlertChannels());
    } catch {
      /* ignore */
    }
  }

  async saveAlert(): Promise<void> {
    if (!this.auth.tenantId()) return;
    if (!this.alertTarget.trim()) {
      this.error.set('Indicá URL o email de alerta.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.scanService.upsertAlertChannel({
        kind: this.alertKind,
        target: this.alertTarget.trim(),
        label: this.alertLabel.trim() || undefined,
        categories: ['all'],
      });
      this.alertTarget = '';
      await this.refreshAlerts();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  async removeAlert(channelId: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.scanService.deleteAlertChannel(channelId);
      await this.refreshAlerts();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  async connect(): Promise<void> {
    if (!this.auth.tenantId()) {
      this.error.set('Falta custom:tenant_id en el token Cognito.');
      return;
    }
    if (!/^\d{12}$/.test(this.accountId.trim())) {
      this.error.set('Account ID debe tener 12 dígitos.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.scanService.linkAwsAccount({
        accountId: this.accountId.trim(),
        displayName: this.displayName.trim() || undefined,
        roleName: this.roleName.trim() || undefined,
      });
      this.linkResult.set(result);
      this.tenant.setActiveAccount(result.accountId);
      await this.refreshAccounts();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  async verify(): Promise<void> {
    const accountId = this.linkResult()?.accountId ?? this.accountId.trim();
    if (!this.auth.tenantId() || !accountId) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const verified = await this.scanService.verifyAwsAccountLink({
        accountId,
      });
      const current = this.linkResult();
      if (current) {
        this.linkResult.set({ ...current, status: verified.status });
      }
      await this.refreshAccounts();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  async startAudit(): Promise<void> {
    const tenantId = this.auth.tenantId();
    const accountId = this.linkResult()?.accountId ?? this.accountId.trim();
    if (!tenantId || !accountId) {
      this.error.set('Conectá y verificá una cuenta primero.');
      return;
    }

    this.tenant.setActiveAccount(accountId);
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.scanService.startAudit({ accountId });
      this.lastScanId.set(result.auditId);
      this.realtime.ensureConnected(tenantId, { auditId: result.auditId });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
