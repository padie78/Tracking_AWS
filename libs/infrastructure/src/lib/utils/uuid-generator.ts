import { randomUUID } from 'node:crypto';
import type { IIdGenerator } from '@track-aws/application';

export class UuidGenerator implements IIdGenerator {
  generate(): string {
    return randomUUID();
  }
}
