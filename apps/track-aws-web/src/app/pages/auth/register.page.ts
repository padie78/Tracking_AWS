import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { mapAuthErrorMessage } from '../../core/auth/auth.errors';

@Component({
  standalone: true,
  selector: 'app-register-page',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="ta-auth">
      <form class="ta-auth__card" (ngSubmit)="submit()">
        <div>
          <div class="ta-brand" style="margin-bottom: 0.35rem">Track <span>AWS</span></div>
          <h1>Crear cuenta</h1>
          <p class="ta-auth__lead">
            El Tenant ID aísla tus datos. Usá un slug estable (ej. <code>demo</code>).
          </p>
        </div>

        <div class="ta-form-grid">
          <div class="ta-float" [class.--filled]="!!email">
            <input
              class="ta-input"
              type="email"
              name="email"
              [(ngModel)]="email"
              required
              autocomplete="email"
              placeholder=" "
            />
            <label>Email</label>
          </div>

          <div class="ta-float" [class.--filled]="!!password">
            <input
              class="ta-input"
              type="password"
              name="password"
              [(ngModel)]="password"
              required
              autocomplete="new-password"
              placeholder=" "
            />
            <label>Password</label>
          </div>

          <div class="ta-field">
            <div class="ta-float" [class.--filled]="!!tenantId">
              <input
                class="ta-input"
                type="text"
                name="tenantId"
                [(ngModel)]="tenantId"
                required
                placeholder=" "
              />
              <label>Tenant ID</label>
            </div>
            <div class="ta-field__hint">Queda en Cognito como custom:tenant_id (inmutable en JWT).</div>
          </div>

          @if (needsCode()) {
            <div class="ta-float" [class.--filled]="!!code">
              <input
                class="ta-input"
                type="text"
                name="code"
                [(ngModel)]="code"
                placeholder=" "
                autocomplete="one-time-code"
              />
              <label>Código de confirmación</label>
            </div>
          }
        </div>

        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
        @if (info()) {
          <div class="ta-info">{{ info() }}</div>
        }

        <button class="ta-btn ta-btn--block" type="submit" [disabled]="busy()">
          {{ needsCode() ? (busy() ? 'Confirmando…' : 'Confirmar') : busy() ? 'Registrando…' : 'Registrar' }}
        </button>

        <div class="ta-auth__footer">
          <span class="ta-meta">Rol inicial: finops_admin</span>
          <a routerLink="/login" class="ta-link">Ya tengo cuenta</a>
        </div>
      </form>
    </div>
  `,
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  tenantId = '';
  code = '';
  readonly needsCode = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.needsCode()) {
        await this.auth.confirmRegistration(this.email.trim(), this.code.trim());
        this.info.set('Cuenta confirmada. Podés iniciar sesión.');
        await this.router.navigateByUrl('/login');
        return;
      }
      await this.auth.register(this.email.trim(), this.password, this.tenantId.trim());
      this.needsCode.set(true);
      this.info.set('Revisá el email e ingresá el código de confirmación.');
    } catch (err) {
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
