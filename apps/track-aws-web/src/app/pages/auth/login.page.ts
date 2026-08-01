import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { mapAuthErrorMessage } from '../../core/auth/auth.errors';
import { defaultHomeRouteForRole } from '../../core/auth/user-role';

@Component({
  standalone: true,
  selector: 'app-login-page',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="ta-auth">
      <form class="ta-auth__card" (ngSubmit)="submit()">
        <div>
          <div class="ta-brand" style="margin-bottom: 0.35rem">Track <span>AWS</span></div>
          <h1>Iniciar sesión</h1>
          <p class="ta-auth__lead">Auditoría FinOps / SecOps con AssumeRole cross-account.</p>
        </div>

        <div class="ta-form-grid">
          <div class="ta-float" [class.--filled]="!!email">
            <input
              class="ta-input"
              type="email"
              name="email"
              [(ngModel)]="email"
              required
              autocomplete="username"
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
              autocomplete="current-password"
              placeholder=" "
            />
            <label>Password</label>
          </div>
        </div>

        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }

        <button class="ta-btn ta-btn--block" type="submit" [disabled]="busy()">
          {{ busy() ? 'Entrando…' : 'Entrar' }}
        </button>

        <div class="ta-auth__footer">
          <span class="ta-meta">Cognito · eu-central-1</span>
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
