import { InvalidMoneyError } from '../errors/domain-errors';

export type CurrencyCode = 'USD' | 'EUR';

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: CurrencyCode,
  ) {}

  static from(amount: number, currency: CurrencyCode = 'USD'): Money {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new InvalidMoneyError(`amount=${amount}`);
    }
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidMoneyError(
        `currency mismatch ${this.currency} vs ${other.currency}`,
      );
    }
    return Money.from(this.amount + other.amount, this.currency);
  }

  toJSON(): { amount: number; currency: CurrencyCode } {
    return { amount: this.amount, currency: this.currency };
  }
}
