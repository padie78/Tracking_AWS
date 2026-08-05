import cloudqueryFinops from '../../../../../integrations/mock-scanner/fixtures/01-cloudquery-finops.json';
import prowlerSecops from '../../../../../integrations/mock-scanner/fixtures/02-prowler-secops.json';
import trivyAppsec from '../../../../../integrations/mock-scanner/fixtures/03-trivy-appsec.json';
import komiserInventory from '../../../../../integrations/mock-scanner/fixtures/04-komiser-inventory.json';
import infracostLines from '../../../../../integrations/mock-scanner/fixtures/05-infracost-lines.json';

export type MockCloudqueryFixture = typeof cloudqueryFinops;
export type MockProwlerFixture = typeof prowlerSecops;
export type MockTrivyFixture = typeof trivyAppsec;
export type MockKomiserFixture = typeof komiserInventory;
export type MockInfracostFixture = typeof infracostLines;

export const MOCK_SCANNER_FIXTURES = {
  cloudquery: cloudqueryFinops as MockCloudqueryFixture,
  prowler: prowlerSecops as MockProwlerFixture,
  trivy: trivyAppsec as MockTrivyFixture,
  komiser: komiserInventory as MockKomiserFixture,
  infracost: infracostLines as MockInfracostFixture,
} as const;

export function mockScannerKeys(tenantId: string, auditId: string) {
  const base = `tenants/${tenantId}/audits/${auditId}`;
  return {
    cloudquery: `${base}/cloudquery/findings.json`,
    prowler: `${base}/prowler/findings.json`,
    trivy: `${base}/trivy/findings.json`,
    komiser: `${base}/komiser/findings.json`,
    infracost: `${base}/infracost/lines.json`,
  };
}
