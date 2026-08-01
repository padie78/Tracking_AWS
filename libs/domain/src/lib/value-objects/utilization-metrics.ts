import { DomainError } from '../errors/domain-errors';

export class InvalidUtilizationMetricsError extends DomainError {
  constructor(detail: string) {
    super(`Métricas de utilización inválidas: ${detail}`);
  }
}

export interface UtilizationMetricsProps {
  avgCpuPercent: number;
  avgMemoryPercent: number | null;
  sampleWindowDays: number;
}

/** Métricas efímeras de utilización (CPU/RAM) — no se persisten crudas. */
export class UtilizationMetrics {
  private constructor(private readonly props: UtilizationMetricsProps) {}

  static from(input: UtilizationMetricsProps): UtilizationMetrics {
    if (
      !Number.isFinite(input.avgCpuPercent) ||
      input.avgCpuPercent < 0 ||
      input.avgCpuPercent > 100
    ) {
      throw new InvalidUtilizationMetricsError(`avgCpuPercent=${input.avgCpuPercent}`);
    }
    if (
      input.avgMemoryPercent !== null &&
      (!Number.isFinite(input.avgMemoryPercent) ||
        input.avgMemoryPercent < 0 ||
        input.avgMemoryPercent > 100)
    ) {
      throw new InvalidUtilizationMetricsError(
        `avgMemoryPercent=${input.avgMemoryPercent}`,
      );
    }
    if (!Number.isInteger(input.sampleWindowDays) || input.sampleWindowDays < 1) {
      throw new InvalidUtilizationMetricsError(
        `sampleWindowDays=${input.sampleWindowDays}`,
      );
    }
    return new UtilizationMetrics(input);
  }

  get avgCpuPercent(): number {
    return this.props.avgCpuPercent;
  }

  get avgMemoryPercent(): number | null {
    return this.props.avgMemoryPercent;
  }

  get sampleWindowDays(): number {
    return this.props.sampleWindowDays;
  }

  isUnderutilized(cpuThreshold = 20, memoryThreshold = 30): boolean {
    const cpuLow = this.props.avgCpuPercent < cpuThreshold;
    if (this.props.avgMemoryPercent === null) return cpuLow;
    return cpuLow && this.props.avgMemoryPercent < memoryThreshold;
  }
}
