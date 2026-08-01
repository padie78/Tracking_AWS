import { DomainError } from '../errors/domain-errors';

export class InvalidInstanceTypeError extends DomainError {
  constructor(instanceType: string) {
    super(`Tipo de instancia inválido: ${instanceType}`);
  }
}

/** Familia/tipo EC2 (ej. t2.micro, t3.medium, m6g.large). */
export class InstanceType {
  private constructor(public readonly value: string) {}

  static from(raw: string): InstanceType {
    const normalized = raw.trim().toLowerCase();
    if (!/^[a-z][a-z0-9]*\.[a-z0-9]+$/.test(normalized)) {
      throw new InvalidInstanceTypeError(raw);
    }
    return new InstanceType(normalized);
  }

  get family(): string {
    return this.value.split('.')[0] ?? this.value;
  }

  toString(): string {
    return this.value;
  }
}
