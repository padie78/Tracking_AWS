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
        <h1>Track AWS</h1>
        <p class="ta-meta">FinOps · optimización de costos vía MCP</p>

        <label>
          Email
          <input type="email" name="email" [(ngModel)]="email" required autocomplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            [(ngModel)]="password"
            required
            autocomplete="current-password"
          />
        </label>

        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }

        <button class="ta-btn" type="submit" [disabled]="busy()">Entrar</button>
        <a routerLink="/register" class="ta-meta">Crear cuenta</a>
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
