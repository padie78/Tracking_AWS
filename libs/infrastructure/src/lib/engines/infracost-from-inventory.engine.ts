import type { InventoryResourceView } from '@track-aws/application';

export interface InfracostLineItem {
  project_name: string;
  resource_name: string;
  resource_type: string;
  monthly_cost_usd: number;
  hourly_cost_usd: number;
  currency: string;
}

/**
 * Estimación de costos estilo Infracost a partir del inventario CloudQuery.
 * (CLI Infracost + TF plan = etapa posterior; este motor deja Parquet Hive usable ya.)
 */
export function estimateInfracostFromInventory(input: {
  accountId: string;
  auditId: string;
  resources: InventoryResourceView[];
}): InfracostLineItem[] {
  return input.resources
    .filter((r) => (r.estimatedMonthlyCostUsd ?? 0) > 0 || billableType(r.resourceType))
    .map((r) => {
      const monthly = Number(r.estimatedMonthlyCostUsd ?? defaultMonthly(r.resourceType));
      return {
        project_name: `aws-${input.accountId}`,
        resource_name: r.resourceId,
        resource_type: r.resourceType,
        monthly_cost_usd: Math.round(monthly * 100) / 100,
        hourly_cost_usd: Math.round((monthly / 730) * 10000) / 10000,
        currency: 'USD',
      };
    })
    .sort((a, b) => b.monthly_cost_usd - a.monthly_cost_usd)
    .slice(0, 500);
}

function billableType(t: string): boolean {
  return /^(ec2|ebs|eip|rds|elb|nat|lambda|dynamodb|s3|ecs|eks|cloudfront)/i.test(t);
}

function defaultMonthly(t: string): number {
  const map: Record<string, number> = {
    nat: 32,
    elb: 22,
    rds: 80,
    eip: 3.65,
    lambda: 1,
    dynamodb: 5,
    s3: 2,
    cloudfront: 10,
  };
  return map[t] ?? 0;
}
