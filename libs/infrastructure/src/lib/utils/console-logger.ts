import type { ILogger } from '@track-aws/application';

export class ConsoleLogger implements ILogger {
  constructor(private readonly context: Record<string, unknown> = {}) {}

  withContext(extra: Record<string, unknown>): ConsoleLogger {
    return new ConsoleLogger({ ...this.context, ...extra });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('INFO', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('WARN', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('ERROR', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env['LOG_LEVEL'] === 'DEBUG') {
      this.write('DEBUG', message, meta);
    }
  }

  private write(level: string, message: string, meta?: Record<string, unknown>): void {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...(meta ?? {}),
    };
    const line = JSON.stringify(entry);
    if (level === 'ERROR') console.error(line);
    else console.log(line);
  }
}
