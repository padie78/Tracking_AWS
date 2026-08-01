import type {
  AuditReportRecordView,
  IAuditReportReader,
} from '../../ports/audit/audit-report.port';

export class GetAuditReportUseCase {
  constructor(private readonly reports: IAuditReportReader) {}

  async execute(input: {
    tenantId: string;
    auditId: string;
  }): Promise<AuditReportRecordView | null> {
    return this.reports.findByAuditId(input.tenantId, input.auditId);
  }
}
