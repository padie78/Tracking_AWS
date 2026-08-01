export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidFindingCategoryError extends DomainError {
  constructor(category: string) {
    super(`Categoría de finding inválida: ${category}`);
  }
}

export class InvalidMoneyError extends DomainError {
  constructor(detail: string) {
    super(`Monto inválido: ${detail}`);
  }
}

export class InvalidUserRoleError extends DomainError {
  constructor(role: string) {
    super(`Rol de usuario inválido: ${role}`);
  }
}

export class InvalidScanStatusError extends DomainError {
  constructor(status: string) {
    super(`Estado de scan inválido: ${status}`);
  }
}
