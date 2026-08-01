import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { defaultHomeRouteForRole } from '../../core/auth/user-role';

@Component({
  standalone: true,
  selector: 'app-auth-callback-page',
  encapsulation: ViewEncapsulation.None,
  template: `<div class="ta-auth"><p class="ta-meta">Completando OAuth…</p></div>`,
})
export class AuthCallbackPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.auth.restoreSession();
    await this.router.navigateByUrl(defaultHomeRouteForRole(this.auth.userRole()));
  }
}
