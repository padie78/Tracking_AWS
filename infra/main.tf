locals {
  name_prefix = "${var.project_name}-${var.environment}"
  event_tags = {
    Layer = "event-network"
  }
  # ARN predecible para evitar ciclo lambdas ↔ Step Functions
  audit_state_machine_arn = "arn:aws:states:${var.aws_region}:${data.aws_caller_identity.current.account_id}:stateMachine:${local.name_prefix}-audit"
}

data "aws_caller_identity" "current" {}

module "database" {
  source      = "./modules/database"
  name_prefix = local.name_prefix
}

module "storage" {
  source      = "./modules/storage"
  name_prefix = local.name_prefix
  # Dev: purge Hive engine Parquet after 7d. Prod: override to 0.
  data_lake_engine_expire_days = var.environment == "prod" ? 0 : 7
}

module "analytics" {
  source                = "./modules/analytics"
  name_prefix           = local.name_prefix
  data_lake_bucket_name = module.storage.data_lake_bucket_name
  data_lake_bucket_arn  = module.storage.data_lake_bucket_arn
}

module "queues" {
  source      = "./modules/queues"
  name_prefix = local.name_prefix
  tags        = local.event_tags
}

module "alerts" {
  source      = "./modules/alerts"
  name_prefix = local.name_prefix
}

module "prowler_fargate" {
  source      = "./modules/prowler_fargate"
  name_prefix = local.name_prefix
  aws_region  = var.aws_region
  tags        = local.event_tags

  artifacts_bucket_name = module.storage.artifacts_bucket_name
  artifacts_bucket_arn  = module.storage.artifacts_bucket_arn
}

module "lambdas" {
  source      = "./modules/lambdas"
  name_prefix = local.name_prefix

  table_name = module.database.table_name
  table_arn  = module.database.table_arn

  scan_queue_url              = module.queues.scan_queue_url
  scan_queue_arn              = module.queues.scan_queue_arn
  scan_dlq_arn                = module.queues.dlq_arns["scan"]
  rightsizing_queue_url       = module.queues.rightsizing_queue_url
  rightsizing_queue_arn       = module.queues.rightsizing_queue_arn
  rightsizing_dlq_arn         = module.queues.dlq_arns["rightsizing"]
  modernization_queue_url     = module.queues.modernization_queue_url
  modernization_queue_arn     = module.queues.modernization_queue_arn
  modernization_dlq_arn       = module.queues.dlq_arns["modernization"]
  orphaned_queue_url          = module.queues.orphaned_queue_url
  orphaned_queue_arn          = module.queues.orphaned_queue_arn
  orphaned_dlq_arn            = module.queues.dlq_arns["orphaned"]
  dossier_queue_url           = module.queues.dossier_queue_url
  dossier_queue_arn           = module.queues.dossier_queue_arn
  dossier_dlq_arn             = module.queues.dlq_arns["dossier"]
  scan_ingestion_secret       = var.scan_ingestion_secret
  bedrock_model_id            = var.bedrock_model_id
  connect_template_url        = module.storage.connect_template_url
  scanner_account_id          = data.aws_caller_identity.current.account_id
  audit_state_machine_arn     = local.audit_state_machine_arn
  audit_event_bus_name        = module.alerts.event_bus_name
  audit_alerts_topic_arn      = module.alerts.alerts_topic_arn
  reports_bucket_name         = module.storage.reports_bucket_name
  reports_bucket_arn          = module.storage.reports_bucket_arn
  data_lake_bucket_name       = module.storage.data_lake_bucket_name
  data_lake_bucket_arn        = module.storage.data_lake_bucket_arn
  prowler_findings_bucket     = module.storage.artifacts_bucket_name
  prowler_findings_bucket_arn = module.storage.artifacts_bucket_arn
}

# EventBridge → alert_dispatcher (después de crear la Lambda; evita 404 AddPermission)
resource "aws_cloudwatch_event_target" "alert_dispatcher" {
  rule           = module.alerts.customer_digest_rule_name
  event_bus_name = module.alerts.event_bus_name
  target_id      = "AuditAlertDispatcher"
  arn            = module.lambdas.alert_dispatcher_arn
}

resource "aws_lambda_permission" "events_invoke_alert_dispatcher" {
  statement_id  = "AllowEventBridgeInvokeAlertDispatcher"
  action        = "lambda:InvokeFunction"
  function_name = module.lambdas.alert_dispatcher_name
  principal     = "events.amazonaws.com"
  source_arn    = module.alerts.customer_digest_rule_arn
}

module "orchestration" {
  source      = "./modules/orchestration"
  name_prefix = local.name_prefix
  tags        = local.event_tags

  resolve_account_arn         = module.lambdas.resolve_account_arn
  cloudquery_inventory_arn    = module.lambdas.cloudquery_inventory_arn
  load_prowler_results_arn    = module.lambdas.load_prowler_results_arn
  load_trivy_results_arn      = module.lambdas.load_trivy_results_arn
  fail_audit_arn              = module.lambdas.fail_audit_arn
  aggregate_audit_arn         = module.lambdas.aggregate_audit_arn
  prowler_cluster_arn         = module.prowler_fargate.cluster_arn
  prowler_task_definition_arn = module.prowler_fargate.task_definition_arn
  trivy_task_definition_arn   = module.prowler_fargate.trivy_task_definition_arn
  prowler_container_name      = module.prowler_fargate.container_name
  trivy_container_name        = module.prowler_fargate.trivy_container_name
  prowler_subnet_ids          = module.prowler_fargate.subnet_ids
  prowler_security_group_id   = module.prowler_fargate.security_group_id
  prowler_task_role_arn       = module.prowler_fargate.task_role_arn
  prowler_execution_role_arn  = module.prowler_fargate.execution_role_arn
  prowler_findings_bucket     = module.storage.artifacts_bucket_name
}

module "api" {
  source               = "./modules/api"
  name_prefix          = local.name_prefix
  graphql_api_name     = var.appsync_graphql_api_name
  cognito_user_pool_id = module.auth.user_pool_id
  appsync_api_arn      = module.lambdas.appsync_api_arn
}

module "frontend_hosting" {
  source      = "./modules/frontend_hosting"
  name_prefix = local.name_prefix
}

module "auth" {
  source      = "./modules/auth"
  name_prefix = local.name_prefix
  aws_region  = var.aws_region

  table_name = module.database.table_name
  table_arn  = module.database.table_arn

  domain_prefix       = local.cognito_domain_prefix
  oauth_callback_urls = local.cognito_oauth_callback_urls
  oauth_logout_urls   = local.cognito_oauth_logout_urls

  enable_google_idp    = var.enable_google_idp
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
}
