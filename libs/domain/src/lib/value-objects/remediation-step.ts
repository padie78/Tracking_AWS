import { DomainError } from '../errors/domain-errors';

export class InvalidRemediationStepError extends DomainError {
  constructor(detail: string) {
    super(`Paso de remediación inválido: ${detail}`);
  }
}

export interface RemediationStepProps {
  order: number;
  title: string;
  instruction: string;
  estimatedMinutes: number | null;
}

export class RemediationStep {
  private constructor(private readonly props: RemediationStepProps) {}

  static from(input: RemediationStepProps): RemediationStep {
    if (!Number.isInteger(input.order) || input.order < 1) {
      throw new InvalidRemediationStepError(`order=${input.order}`);
    }
    if (!input.title.trim()) {
      throw new InvalidRemediationStepError('title vacío');
    }
    if (!input.instruction.trim()) {
      throw new InvalidRemediationStepError('instruction vacío');
    }
    return new RemediationStep({
      order: input.order,
      title: input.title.trim(),
      instruction: input.instruction.trim(),
      estimatedMinutes: input.estimatedMinutes,
    });
  }

  get order(): number {
    return this.props.order;
  }

  get title(): string {
    return this.props.title;
  }

  get instruction(): string {
    return this.props.instruction;
  }

  get estimatedMinutes(): number | null {
    return this.props.estimatedMinutes;
  }

  toJSON(): RemediationStepProps {
    return { ...this.props };
  }
}
