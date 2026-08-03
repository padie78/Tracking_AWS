#!/usr/bin/env bash
set -euo pipefail

terraform apply -auto-approve -parallelism=1

echo ""
echo "=== AppSync ==="
terraform output appsync_graphql_api_name
terraform output appsync_api_id
terraform output appsync_endpoint

echo ""
echo "=== Audit pipeline ==="
terraform output audit_state_machine_arn
terraform output cloudquery_inventory_name
terraform output load_prowler_results_name
terraform output load_trivy_results_name
terraform output aggregate_audit_name
terraform output business_etl_aggregator_name
terraform output fail_audit_name
