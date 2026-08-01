import { Injectable, signal } from '@angular/core';

/** Cuenta AWS activa en el portal (matriz cuenta × rol × vista). */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly _activeAccountId = signal<string | null>(null);

  readonly activeAccountId = this._activeAccountId.asReadonly();

  setActiveAccount(accountId: string | null): void {
    this._activeAccountId.set(accountId);
  }
}
