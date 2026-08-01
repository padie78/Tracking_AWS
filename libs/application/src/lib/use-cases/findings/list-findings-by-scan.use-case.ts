import type { Finding } from '@track-aws/domain';
import { z } from 'zod';
import type { IFindingReader } from '../../ports/findings/finding.port';
import { FindingMapper } from '../../mappers/finding.mapper';
import type { FindingDto } from '../../dto/findings/finding.dto';

const ListFindingsByScanInputSchema = z.object({
  tenantId: z.string().min(1),
  scanId: z.string().min(1),
});

export class ListFindingsByScanUseCase {
  constructor(private readonly findingReader: IFindingReader) {}

  async execute(raw: unknown): Promise<FindingDto[]> {
    const input = ListFindingsByScanInputSchema.parse(raw);
    const findings: Finding[] = await this.findingReader.listByScan(
      input.tenantId,
      input.scanId,
    );
    return findings.map(FindingMapper.toDto);
  }
}
