import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/services/auth.service';
import { mapAuthErrorMessage } from '../../core/auth/auth.errors';
import { defaultHomeRouteForRole } from '../../core/auth/user-role';

@Component({
  standalone: true,
  selector: 'app-login-page',
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
          <h1>Iniciar sesión</h1>
          <p class="ta-auth__lead">
            Entrá para ver el estado de tu nube, costos y seguridad en un solo lugar.
          </p>
        </div>

        <div class="ta-form-grid">
          <p-floatLabel>
            <input
              pInputText
              id="login-email"
              type="email"
              name="email"
              [(ngModel)]="email"
              required
              autocomplete="username"
              class="w-full"
              style="width:100%"
            />
            <label for="login-email">Email</label>
          </p-floatLabel>

          <p-floatLabel>
            <p-password
              inputId="login-password"
              [(ngModel)]="password"
              name="password"
              [feedback]="false"
              [toggleMask]="true"
              styleClass="w-full"
              inputStyleClass="w-full"
              autocomplete="current-password"
              [style]="{ width: '100%' }"
              [inputStyle]="{ width: '100%' }"
            />
            <label for="login-password">Contraseña</label>
          </p-floatLabel>
        </div>

        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }

        <button
          pButton
          type="submit"
          [label]="busy() ? 'Entrando…' : 'Entrar'"
          icon="pi pi-sign-in"
          class="w-full"
          style="width:100%"
          [disabled]="busy()"
        ></button>

        <div class="ta-auth__footer">
          <span class="ta-meta">Acceso seguro</span>
          <a routerLink="/register" class="ta-link">Crear cuenta</a>
        </div>
      </form>
    </div>
  `,
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.email.trim(), this.password);
      await this.router.navigateByUrl(defaultHomeRouteForRole(this.auth.userRole()));
    } catch (err) {
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
