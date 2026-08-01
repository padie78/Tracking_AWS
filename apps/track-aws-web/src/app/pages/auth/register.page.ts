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
        <h1>Crear cuenta</h1>
        <p class="ta-meta">Alta multi-tenant (custom:tenant_id)</p>

        <label>
          Email
          <input type="email" name="email" [(ngModel)]="email" required />
        </label>
        <label>
          Password
          <input type="password" name="password" [(ngModel)]="password" required />
        </label>
        <label>
          Tenant ID
          <input type="text" name="tenantId" [(ngModel)]="tenantId" required />
        </label>

        @if (needsCode()) {
          <label>
            Código de confirmación
            <input type="text" name="code" [(ngModel)]="code" />
          </label>
        }

        @if (error()) {
          <div class="ta-error">{{ error() }}</div>
        }
        @if (info()) {
          <div class="ta-meta">{{ info() }}</div>
        }

        <button class="ta-btn" type="submit" [disabled]="busy()">
          {{ needsCode() ? 'Confirmar' : 'Registrar' }}
        </button>
        <a routerLink="/login" class="ta-meta">Ya tengo cuenta</a>
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
