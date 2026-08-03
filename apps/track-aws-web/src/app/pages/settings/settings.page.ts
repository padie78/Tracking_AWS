import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../core/services/auth.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import {
  LinkAwsAccountResultView,
  ScanService,
} from '../../services/scan.service';
import { AppSyncRealtimeService } from '../../services/appsync-realtime.service';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';

@Component({
  standalone: true,
  selector: 'app-settings-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    FormsModule,
    ButtonModule,
    DropdownModule,
    FloatLabelModule,
    InputTextModule,
    PageHeaderComponent,
  ],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        eyebrow="Módulo 9"
        title="Ajustes"
        subtitle="Conectá cuentas AWS, avisos al equipo y permisos. No guardamos claves permanentes."
      />

      @if (!auth.isAdmin()) {
        <div class="ta-error">Solo un administrador puede gestionar las conexiones.</div>
      } @else {
        <div class="ta-form-grid" style="gap: 1.35rem">
          <form class="ta-card" (ngSubmit)="connect()">
            <div class="ta-steps">
              <div class="ta-chip">Paso 1</div>
              <h2 class="ta-steps__title">Vincular una cuenta AWS</h2>
              <p class="ta-meta" style="margin:0">
                Generamos un identificador seguro y una plantilla para crear el rol
                de lectura en tu cuenta.
              </p>
            </div>

            <div class="ta-form-grid ta-form-grid--2" style="margin-top: 1.15rem">
              <p-floatLabel>
                <input
                  pInputText
                  id="set-account"
                  name="accountId"
                  [(ngModel)]="accountId"
                  pattern="\\d{12}"
                  required
                  inputmode="numeric"
                  style="width:100%"
                />
                <label for="set-account">ID de cuenta (12 dígitos)</label>
              </p-floatLabel>
              <p-floatLabel>
                <input
                  pInputText
                  id="set-name"
                  name="displayName"
                  [(ngModel)]="displayName"
                  style="width:100%"
                />
                <label for="set-name">Nombre (Prod / Finanzas)</label>
              </p-floatLabel>
              <p-floatLabel style="grid-column: 1 / -1">
                <input
                  pInputText
                  id="set-role"
                  name="roleName"
                  [(ngModel)]="roleName"
                  style="width:100%"
                />
                <label for="set-role">Nombre del rol de lectura</label>
              </p-floatLabel>
            </div>

            <div class="ta-form-actions">
              <button
                pButton
                type="submit"
                icon="pi pi-link"
                [label]="busy() ? 'Conectando…' : 'Generar vínculo y plantilla'"
                [disabled]="busy()"
              ></button>
            </div>
          </form>

          @if (linkResult(); as link) {
            <div class="ta-card">
              <div class="ta-steps">
                <div
                  class="ta-chip"
                  [class.ta-chip--ok]="link.status === 'active'"
                  [class.ta-chip--warn]="link.status === 'pending'"
                >
                  Paso 2 · {{ link.status }}
                </div>
                <h2 class="ta-steps__title">Activá el rol en la cuenta cliente</h2>
              </div>

              @if (link.status === 'pending') {
                <div class="ta-info" style="margin-top: 0.85rem">
                  <strong>Pendiente</strong> es normal tras el alta. Todavía no se puede revisar.
                  <ol style="margin: 0.55rem 0 0; padding-left: 1.2rem; color: inherit">
                    <li>Abrí la plantilla (botón abajo) en la cuenta <code>{{ link.accountId }}</code>.</li>
                    <li>Creá el stack con los parámetros ya precargados.</li>
                    <li>Cuando termine, pulsá <strong>Verificar conexión</strong>.</li>
                    <li>Si pasa, el estado pasa a <strong>active</strong> y podés usarla en el menú.</li>
                  </ol>
                </div>
              }

              <div class="ta-form-grid" style="margin-top: 1.15rem">
                <div class="ta-field">
                  <span class="ta-field__label">ARN del rol</span>
                  <input pInputText [value]="link.roleArn" readonly style="width:100%" />
                </div>
                <div class="ta-field">
                  <span class="ta-field__label">External ID</span>
                  <input
                    pInputText
                    [value]="link.externalId"
                    readonly
                    style="width:100%"
                    (click)="$any($event.target).select()"
                  />
                  <span class="ta-field__hint">Copiá este valor si lo pedís en la plantilla.</span>
                </div>
                <div class="ta-form-grid ta-form-grid--2">
                  <div class="ta-field">
                    <span class="ta-field__label">Cuenta scanner</span>
                    <input pInputText [value]="link.scannerAccountId" readonly style="width:100%" />
                  </div>
                  <div class="ta-field">
                    <span class="ta-field__label">Rol scanner</span>
                    <input pInputText [value]="link.scannerRoleArn" readonly style="width:100%" />
                  </div>
                </div>
              </div>

              <div class="ta-form-actions">
                <a
                  pButton
                  class="p-button"
                  [href]="link.cloudFormationUrl"
                  target="_blank"
                  rel="noopener"
                  label="Abrir plantilla"
                  icon="pi pi-external-link"
                ></a>
                <button
                  pButton
                  type="button"
                  class="p-button-outlined"
                  icon="pi pi-check"
                  [label]="busy() ? 'Verificando…' : 'Verificar conexión'"
                  [disabled]="busy()"
                  (click)="verify()"
                ></button>
                <button
                  pButton
                  type="button"
                  class="p-button-text"
                  icon="pi pi-play"
                  [label]="busy() ? 'Iniciando…' : 'Iniciar revisión'"
                  [disabled]="busy() || link.status !== 'active'"
                  (click)="startAudit()"
                ></button>
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
                        pButton
                        type="button"
                        class="p-button-outlined p-button-sm"
                        label="Usar"
                        (click)="selectAccount(a.accountId)"
                      ></button>
                    </div>
                  </li>
                }
              </ul>
            </div>
          }

          <div class="ta-card">
            <div class="ta-steps">
              <div class="ta-chip">Alertas</div>
              <h2 class="ta-steps__title">Canales de aviso</h2>
              <p class="ta-meta" style="margin:0">
                Slack, webhook o email para resúmenes después de cada revisión.
              </p>
            </div>

            <div class="ta-form-grid ta-form-grid--2" style="margin-top: 1.15rem">
              <div class="ta-field">
                <span class="ta-field__label">Tipo</span>
                <p-dropdown
                  [options]="alertKindOptions"
                  [(ngModel)]="alertKind"
                  name="alertKind"
                  optionLabel="label"
                  optionValue="value"
                  [style]="{ width: '100%' }"
                  appendTo="body"
                />
              </div>
              <p-floatLabel>
                <input
                  pInputText
                  id="alert-label"
                  name="alertLabel"
                  [(ngModel)]="alertLabel"
                  style="width:100%"
                />
                <label for="alert-label">Etiqueta</label>
              </p-floatLabel>
              <p-floatLabel style="grid-column: 1 / -1">
                <input
                  pInputText
                  id="alert-target"
                  name="alertTarget"
                  [(ngModel)]="alertTarget"
                  style="width:100%"
                />
                <label for="alert-target">Destino (URL o email)</label>
              </p-floatLabel>
            </div>

            <div class="ta-form-actions">
              <button
                pButton
                type="button"
                icon="pi pi-save"
                label="Guardar canal"
                [disabled]="busy()"
                (click)="saveAlert()"
              ></button>
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
                      pButton
                      type="button"
                      class="p-button-outlined p-button-sm"
                      icon="pi pi-trash"
                      label="Eliminar"
                      (click)="removeAlert(c.channelId)"
                    ></button>
                  </li>
                }
              </ul>
            }
          </div>

          @if (lastScanId()) {
            <div class="ta-info">Última revisión: {{ lastScanId() }}</div>
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

  readonly alertKindOptions = [
    { label: 'Slack (webhook)', value: 'slack' as const },
    { label: 'Webhook HTTPS', value: 'webhook' as const },
    { label: 'Email', value: 'email' as const },
  ];

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
      this.error.set('Falta el identificador de organización en tu sesión.');
      return;
    }
    if (!/^\d{12}$/.test(this.accountId.trim())) {
      this.error.set('El ID de cuenta debe tener 12 dígitos.');
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
