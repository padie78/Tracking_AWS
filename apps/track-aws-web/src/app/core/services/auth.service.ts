import { Injectable, computed, signal } from '@angular/core';
import {
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import {
  AuthPendingConfirmationError,
  isAlreadyAuthenticatedError,
} from '../auth/auth.errors';
import { decodeJwtPayload } from '../auth/appsync-auth.util';
import { normalizeUserRole, type UserRole } from '../auth/user-role';

export type { UserRole };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _userId = signal<string | null>(null);
  private readonly _email = signal<string | null>(null);
  private readonly _tenantId = signal<string | null>(null);
  private readonly _userRole = signal<UserRole | null>(null);
  private readonly _defaultAccountId = signal<string | null>(null);

  readonly userId = computed(() => this._userId());
  readonly email = computed(() => this._email());
  readonly tenantId = computed(() => this._tenantId());
  readonly userRole = computed((): UserRole => this._userRole() ?? 'viewer');
  readonly defaultAccountId = computed(() => this._defaultAccountId());
  readonly isAuthenticated = computed(() => !!this._userId());
  readonly isAdmin = computed(() => this._userRole() === 'finops_admin');
  readonly isAnalyst = computed(() => this._userRole() === 'analyst');
  readonly isViewer = computed(() => this.userRole() === 'viewer');

  async restoreSession(): Promise<boolean> {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) return false;
      this.applyToken(idToken);
      await this.refreshUserAttributes();
      return true;
    } catch {
      return false;
    }
  }

  async login(email: string, password: string): Promise<void> {
    try {
      const result = await signIn({
        username: email,
        password,
        options: { authFlowType: 'USER_PASSWORD_AUTH' },
      });

      if (!result.isSignedIn) {
        if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          throw new AuthPendingConfirmationError();
        }
        throw new Error(`Login incompleto: ${result.nextStep.signInStep}`);
      }

      await this.persistSessionFromTokens();
      await this.refreshUserAttributes();
    } catch (err) {
      if (isAlreadyAuthenticatedError(err)) {
        await this.restoreSession();
        return;
      }
      throw err;
    }
  }

  async register(email: string, password: string, tenantId: string): Promise<void> {
    await signUp({
      username: email,
      password,
      options: {
        userAttributes: {
          email,
          'custom:tenant_id': tenantId,
          'custom:user_role': 'viewer',
        },
      },
    });
  }

  async confirmRegistration(email: string, code: string): Promise<void> {
    await confirmSignUp({ username: email, confirmationCode: code });
  }

  async logout(): Promise<void> {
    await signOut();
    this._userId.set(null);
    this._email.set(null);
    this._tenantId.set(null);
    this._userRole.set(null);
    this._defaultAccountId.set(null);
  }

  private async persistSessionFromTokens(): Promise<void> {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) throw new Error('Sesión sin idToken.');
    this.applyToken(idToken);
  }

  private applyToken(idToken: string): void {
    const claims = decodeJwtPayload(idToken);
    const sub = typeof claims['sub'] === 'string' ? claims['sub'] : null;
    const email = typeof claims['email'] === 'string' ? claims['email'] : null;
    const tenantId =
      typeof claims['custom:tenant_id'] === 'string'
        ? claims['custom:tenant_id']
        : null;
    const role = normalizeUserRole(claims['custom:user_role']);
    const accountId =
      typeof claims['custom:default_account_id'] === 'string'
        ? claims['custom:default_account_id']
        : null;

    this._userId.set(sub);
    this._email.set(email);
    this._tenantId.set(tenantId);
    this._userRole.set(role);
    this._defaultAccountId.set(accountId);
  }

  private async refreshUserAttributes(): Promise<void> {
    try {
      const attrs = await fetchUserAttributes();
      if (attrs['email']) this._email.set(attrs['email']);
      if (attrs['custom:tenant_id']) this._tenantId.set(attrs['custom:tenant_id']);
      if (attrs['custom:user_role']) {
        this._userRole.set(normalizeUserRole(attrs['custom:user_role']));
      }
      if (attrs['custom:default_account_id']) {
        this._defaultAccountId.set(attrs['custom:default_account_id']);
      }
    } catch {
      // Token claims ya aplicados.
    }
  }
}
