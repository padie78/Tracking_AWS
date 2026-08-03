import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/services/auth.service';
import { mapAuthErrorMessage } from '../../core/auth/auth.errors';

@Component({
  standalone: true,
  selector: 'app-register-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    FloatLabelModule,
  ],
  template: `
    <div class="ta-auth">
      <form class="ta-auth__card" (ngSubmit)="submit()">
        <div>
          <div class="ta-brand" style="margin-bottom: 0.45rem">Track <span>AWS</span></div>
          <h1>Crear cuenta</h1>
          <p class="ta-auth__lead">
            Elegí un identificador de organización estable (ej. <code>demo</code>). Así
            tus datos quedan separados de otros clientes.
          </p>
        </div>

        <div class="ta-form-grid">
          <p-floatLabel>
            <input
              pInputText
              id="reg-email"
              type="email"
              name="email"
              [(ngModel)]="email"
              required
              autocomplete="email"
              style="width:100%"
            />
            <label for="reg-email">Email</label>
          </p-floatLabel>

          <p-floatLabel>
            <p-password
              inputId="reg-password"
              [(ngModel)]="password"
              name="password"
              [toggleMask]="true"
              styleClass="w-full"
              [style]="{ width: '100%' }"
              [inputStyle]="{ width: '100%' }"
              autocomplete="new-password"
            />
            <label for="reg-password">Contraseña</label>
          </p-floatLabel>

          <div class="ta-field">
            <p-floatLabel>
              <input
                pInputText
                id="reg-tenant"
                type="text"
                name="tenantId"
                [(ngModel)]="tenantId"
                required
                style="width:100%"
              />
              <label for="reg-tenant">ID de organización</label>
            </p-floatLabel>
            <div class="ta-field__hint">
              Queda asociado a tu usuario y no se pide en cada pantalla.
            </div>
          </div>

          @if (needsCode()) {
            <p-floatLabel>
              <input
                pInputText
                id="reg-code"
                type="text"
                name="code"
                [(ngModel)]="code"
                autocomplete="one-time-code"
                style="width:100%"
              />
              <label for="reg-code">Código de confirmación</label>
            </p-floatLabel>
          }
        </div>

        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
        @if (info()) {
          <div class="ta-info">{{ info() }}</div>
        }

        <button
          pButton
          type="submit"
          [label]="
            needsCode()
              ? busy()
                ? 'Confirmando…'
                : 'Confirmar'
              : busy()
                ? 'Registrando…'
                : 'Registrar'
          "
          icon="pi pi-user-plus"
          style="width:100%"
          [disabled]="busy()"
        ></button>

        <div class="ta-auth__footer">
          <span class="ta-meta">Rol inicial: administrador</span>
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
      await this.auth.register(
        this.email.trim(),
        this.password,
        this.tenantId.trim().toLowerCase(),
      );
      this.needsCode.set(true);
      this.info.set('Te enviamos un código de confirmación al email.');
    } catch (err) {
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
