export class AuthPendingConfirmationError extends Error {
  constructor(message = 'Confirmá el email antes de iniciar sesión.') {
    super(message);
    this.name = 'AuthPendingConfirmationError';
  }
}

export function isAlreadyAuthenticatedError(err: unknown): boolean {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: unknown }).name)
      : '';
  return name === 'UserAlreadyAuthenticatedException';
}

export function mapAuthErrorMessage(err: unknown): string {
  if (err instanceof AuthPendingConfirmationError) return err.message;
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: unknown }).name)
      : '';
  if (name === 'NotAuthorizedException') return 'Email o contraseña incorrectos.';
  if (name === 'UsernameExistsException') return 'Ya existe una cuenta con ese email.';
  if (name === 'UserNotConfirmedException') {
    return 'Confirmá el email antes de iniciar sesión.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'No se pudo completar la autenticación.';
}
