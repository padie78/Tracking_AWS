import { DomainError } from './domain-errors';

export class McpConnectionError extends DomainError {
  constructor(detail: string) {
    super(`Fallo de conexión MCP: ${detail}`);
  }
}
