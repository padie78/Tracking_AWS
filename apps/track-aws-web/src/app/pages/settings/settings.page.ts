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
    <section class="ta-page ta-page--wide">
      <div class="ta-page__head">
        <div>
          <h1>Settings</h1>
          <p>
            Conectá una cuenta AWS con AssumeRole + External ID. Track_AWS no guarda
            credenciales permanentes.
          </p>
        </div>
      </div>

      @if (!auth.isAdmin()) {
        <div class="ta-error">Solo finops_admin puede gestionar conexiones.</div>
      } @else {
        <div class="ta-form-grid" style="gap: 1.25rem">
          <form class="ta-card" (ngSubmit)="connect()">
            <div class="ta-steps">
              <div class="ta-chip">Paso 1</div>
              <h2 class="ta-steps__title">Generar vínculo cross-account</h2>
              <p class="ta-meta" style="margin:0">
                External ID + plantilla CloudFormation para el rol scanner.
              </p>
            </div>

            <div class="ta-form-grid ta-form-grid--2" style="margin-top: 1rem">
              <div class="ta-float" [class.--filled]="!!accountId">
                <input
                  class="ta-input"
                  name="accountId"
                  [(ngModel)]="accountId"
                  pattern="\\d{12}"
                  required
                  placeholder=" "
                  inputmode="numeric"
                />
                <label>Account ID (12 dígitos)</label>
              </div>
              <div class="ta-float" [class.--filled]="!!displayName">
                <input
                  class="ta-input"
                  name="displayName"
                  [(ngModel)]="displayName"
                  placeholder=" "
                />
                <label>Nombre (Prod / FinOps)</label>
              </div>
              <div class="ta-float" style="grid-column: 1 / -1" [class.--filled]="!!roleName">
                <input
                  class="ta-input"
                  name="roleName"
                  [(ngModel)]="roleName"
                  placeholder=" "
                />
                <label>Rol IAM</label>
              </div>
            </div>

            <div class="ta-form-actions">
              <button class="ta-btn" type="submit" [disabled]="busy()">
                {{ busy() ? 'Conectando…' : 'Generar External ID + plantilla' }}
              </button>
            </div>
          </form>

          @if (linkResult(); as link) {
            <div class="ta-card">
              <div class="ta-steps">
                <div class="ta-chip" [class.ta-chip--ok]="link.status === 'active'" [class.ta-chip--warn]="link.status === 'pending'">
                  Paso 2 · {{ link.status }}
                </div>
                <h2 class="ta-steps__title">Desplegá el rol en la cuenta cliente</h2>
              </div>

              @if (link.status === 'pending') {
                <div class="ta-info" style="margin-top: 0.85rem">
                  <strong>pending</strong> es normal tras el alta. Todavía no se puede auditar.
                  <ol style="margin: 0.55rem 0 0; padding-left: 1.2rem; color: inherit">
                    <li>Abrí CloudFormation (botón abajo) en la cuenta <code>{{ link.accountId }}</code>.</li>
                    <li>Creá el stack (los parámetros External ID / Account ya vienen precargados).</li>
                    <li>Cuando el stack termine en CREATE_COMPLETE, pulsá <strong>Verificar AssumeRole</strong>.</li>
                    <li>Si pasa, el estado pasa a <strong>active</strong> y aparece usable en el combo.</li>
                  </ol>
                </div>
              }

              <div class="ta-form-grid" style="margin-top: 1rem">
                <div class="ta-field">
                  <span class="ta-field__label">Role ARN</span>
                  <input class="ta-input" [value]="link.roleArn" readonly />
                </div>
                <div class="ta-field">
                  <span class="ta-field__label">External ID</span>
                  <input
                    class="ta-input"
                    [value]="link.externalId"
                    readonly
                    (click)="$any($event.target).select()"
                  />
                  <span class="ta-field__hint">Copiá al trust policy / CloudFormation.</span>
                </div>
                <div class="ta-form-grid ta-form-grid--2">
                  <div class="ta-field">
                    <span class="ta-field__label">Scanner account</span>
                    <input class="ta-input" [value]="link.scannerAccountId" readonly />
                  </div>
                  <div class="ta-field">
                    <span class="ta-field__label">Scanner role</span>
                    <input class="ta-input" [value]="link.scannerRoleArn" readonly />
                  </div>
                </div>
              </div>

              <div class="ta-form-actions">
                <a class="ta-btn" [href]="link.cloudFormationUrl" target="_blank" rel="noopener">
                  Abrir CloudFormation
                </a>
                <button
                  class="ta-btn ta-btn--secondary"
                  type="button"
                  [disabled]="busy()"
                  (click)="verify()"
                >
                  {{ busy() ? 'Verificando…' : 'Verificar AssumeRole' }}
                </button>
                <button
                  class="ta-btn ta-btn--ghost"
                  type="button"
                  [disabled]="busy() || link.status !== 'active'"
                  (click)="startAudit()"
                >
                  {{ busy() ? 'Iniciando…' : 'Start audit' }}
                </button>
              </div>
            </div>
          }

          @if (accounts().length) {
            <div class="ta-card ta-card--flat">
              <h2 class="ta-card__title">Cuentas vinculadas</h2>
              <ul class="ta-account-list">
                @for (a of accounts(); track a.accountId) {
                  <li>
                    <div>
                      <strong>{{ a.displayName || a.accountId }}</strong>
                      <div class="ta-meta">{{ a.accountId }}</div>
                    </div>
                    <div style="display:flex;gap:0.5rem;align-items:center">
                      <span
                        class="ta-chip"
                        [class.ta-chip--ok]="a.status === 'active'"
                        [class.ta-chip--warn]="a.status !== 'active'"
                      >
                        {{ a.status }}
                      </span>
                      <button
                        type="button"
                        class="ta-btn ta-btn--ghost ta-btn--sm"
                        (click)="selectAccount(a.accountId)"
                      >
                        Usar
                      </button>
                    </div>
                  </li>
                }
              </ul>
            </div>
          }

          <div class="ta-card">
            <div class="ta-steps">
              <div class="ta-chip">Alertas</div>
              <h2 class="ta-steps__title">Canales al cliente</h2>
              <p class="ta-meta" style="margin:0">
                Slack / webhook / email (SNS) para digests post-audit.
              </p>
            </div>

            <div class="ta-form-grid ta-form-grid--2" style="margin-top: 1rem">
              <div class="ta-field">
                <span class="ta-field__label">Tipo</span>
                <select class="ta-select" name="alertKind" [(ngModel)]="alertKind">
                  <option value="slack">Slack Incoming Webhook</option>
                  <option value="webhook">Webhook HTTPS</option>
                  <option value="email">Email (vía SNS)</option>
                </select>
              </div>
              <div class="ta-float" [class.--filled]="!!alertLabel">
                <input class="ta-input" name="alertLabel" [(ngModel)]="alertLabel" placeholder=" " />
                <label>Etiqueta</label>
              </div>
              <div class="ta-float" style="grid-column: 1 / -1" [class.--filled]="!!alertTarget">
                <input
                  class="ta-input"
                  name="alertTarget"
                  [(ngModel)]="alertTarget"
                  placeholder=" "
                />
                <label>Destino (URL o email)</label>
              </div>
            </div>

            <div class="ta-form-actions">
              <button class="ta-btn" type="button" [disabled]="busy()" (click)="saveAlert()">
                Guardar canal
              </button>
            </div>

            @if (alertChannels().length) {
              <hr class="ta-divider" />
              <ul class="ta-account-list">
                @for (c of alertChannels(); track c.channelId) {
                  <li>
                    <div>
                      <strong>{{ c.label }}</strong>
                      <div class="ta-meta">{{ c.kind }} · {{ c.target }}</div>
                    </div>
                    <button
                      type="button"
                      class="ta-btn ta-btn--ghost ta-btn--sm"
                      (click)="removeAlert(c.channelId)"
                    >
                      Eliminar
                    </button>
                  </li>
                }
              </ul>
            }
          </div>

          @if (lastScanId()) {
            <div class="ta-info">Último auditId: {{ lastScanId() }}</div>
          }
          @if (error()) {
            <div class="ta-error">{{ error() }}</div>
          }
        </div>
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
