#!/usr/bin/env bash
set -euo pipefail

terraform apply -auto-approve -parallelism=1

echo ""
echo "=== AppSync ==="
terraform output appsync_graphql_api_name
terraform output appsync_api_id
terraform output appsync_endpoint

echo ""
echo "=== Scan ingestion ==="
terraform output scan_url

echo ""
echo "=== Analyzers ==="
terraform output inventory_scanner_name
terraform output rightsizing_analyzer_name
terraform output modernization_analyzer_name
terraform output orphaned_analyzer_name
terraform output dossier_generator_name
