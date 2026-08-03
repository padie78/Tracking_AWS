# AppSync
output "appsync_endpoint" {
  value = module.api.graphql_endpoint
}

output "appsync_realtime_endpoint" {
  value = module.api.realtime_endpoint
}

output "appsync_api_id" {
  value = module.api.api_id
}

output "appsync_graphql_api_name" {
  value = module.api.graphql_api_name
}

output "appsync_api_key" {
  value     = module.api.api_key
  sensitive = true
}

output "appsync_api_name" {
  value = module.lambdas.appsync_api_name
}

# Storage / DB
output "artifacts_bucket" {
  value = module.storage.artifacts_bucket_name
}

output "data_lake_bucket" {
  value = module.storage.data_lake_bucket_name
}

output "table_name" {
  value = module.database.table_name
}

output "core_table_name" {
  value = module.database.core_table_name
}

# Cognito
output "cognito_user_pool_id" {
  value = module.auth.user_pool_id
}

output "cognito_web_client_id" {
  value = module.auth.web_client_id
}

output "cognito_domain" {
  value = module.auth.cognito_domain
}

output "cognito_hosted_ui_base_url" {
  value = module.auth.cognito_hosted_ui_base_url
}

output "post_confirmation_name" {
  value = module.auth.post_confirmation_name
}

# Analytics
output "glue_database_name" {
  value = module.analytics.glue_database_name
}

output "athena_workgroup_name" {
  value = module.analytics.athena_workgroup_name
}

# Frontend
output "frontend_bucket" {
  value = module.frontend_hosting.bucket_name
}

output "frontend_cloudfront_id" {
  value = module.frontend_hosting.distribution_id
}

output "frontend_cloudfront_domain" {
  value = module.frontend_hosting.distribution_domain
}

output "frontend_url" {
  value = "https://${module.frontend_hosting.distribution_domain}"
}

output "connect_template_url" {
  value = module.storage.connect_template_url
}

output "scanner_account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "audit_state_machine_arn" {
  value = module.orchestration.state_machine_arn
}

output "audit_event_bus_name" {
  value = module.alerts.event_bus_name
}

output "audit_alerts_topic_arn" {
  value = module.alerts.alerts_topic_arn
}

output "reports_bucket" {
  value = module.storage.reports_bucket_name
}

# Lambdas (CI update-function-code)
output "resolve_account_name" {
  value = module.lambdas.resolve_account_name
}

output "cloudquery_inventory_name" {
  value = module.lambdas.cloudquery_inventory_name
}

output "prowler_security_name" {
  value       = module.lambdas.load_prowler_results_name
  description = "Lambda que carga findings Prowler (Fargate → S3)"
}

output "load_prowler_results_name" {
  value = module.lambdas.load_prowler_results_name
}

output "prowler_ecr_repository_url" {
  value = module.prowler_fargate.ecr_repository_url
}

output "trivy_ecr_repository_url" {
  value = module.prowler_fargate.trivy_ecr_repository_url
}

output "load_trivy_results_name" {
  value = module.lambdas.load_trivy_results_name
}

output "prowler_cluster_name" {
  value = module.prowler_fargate.cluster_name
}

output "alert_dispatcher_name" {
  value = module.lambdas.alert_dispatcher_name
}

output "aggregate_audit_name" {
  value = module.lambdas.aggregate_audit_name
}

output "business_etl_aggregator_name" {
  value = module.lambdas.business_etl_aggregator_name
}

output "fail_audit_name" {
  value = module.lambdas.fail_audit_name
}
