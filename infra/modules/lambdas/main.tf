data "archive_file" "bootstrap" {
  type        = "zip"
  output_path = "${path.module}/.artifacts/bootstrap.zip"

  source {
    filename = "index.js"
    content  = <<-EOT
      exports.handler = async () => ({
        statusCode: 503,
        body: JSON.stringify({
          message: "Lambda bootstrap deployed. Real code is published by deploy-lambdas workflow."
        })
      });
    EOT
  }
}

locals {
  core_env = {
    CORE_TABLE_NAME = var.table_name
    TABLE_NAME      = var.table_name
    LOG_LEVEL       = "INFO"
  }

  scanner_env = {
    SCANNER_ACCOUNT_ID   = var.scanner_account_id
    SCANNER_ROLE_ARN     = aws_iam_role.lambda_exec.arn
    CONNECT_TEMPLATE_URL = var.connect_template_url
  }

  audit_env = {
    AUDIT_STATE_MACHINE_ARN = var.audit_state_machine_arn
    AUDIT_EVENT_BUS_NAME    = var.audit_event_bus_name
    AUDIT_ALERTS_TOPIC_ARN  = var.audit_alerts_topic_arn
    REPORTS_BUCKET_NAME     = var.reports_bucket_name
    DATA_LAKE_BUCKET_NAME   = var.data_lake_bucket_name
    AUDIT_DETAIL_TTL_DAYS   = "14"
    AUDIT_JOB_TTL_DAYS      = "90"
    AUDIT_HOT_KEEP_COUNT    = "3"
  }
}

# ─────────── AppSync resolver Lambda ───────────

resource "aws_lambda_function" "appsync_api" {
  function_name    = "${var.name_prefix}-appsync-api"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 120
  memory_size      = 512
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, local.scanner_env, local.audit_env, {
      APPSYNC_ENDPOINT = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY  = "placeholder"
    })
  }

  lifecycle {
    ignore_changes = [environment]
  }
}

# ─────────── Audit pipeline (Step Functions tasks) ───────────

resource "aws_lambda_function" "resolve_account" {
  function_name    = "${var.name_prefix}-resolve-account"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 30
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = local.core_env
  }
}

resource "aws_lambda_function" "cloudquery_inventory" {
  function_name    = "${var.name_prefix}-cloudquery-inventory"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 900
  memory_size      = 2048
  architectures    = ["arm64"]

  ephemeral_storage {
    size = 1024
  }

  environment {
    variables = merge(local.core_env, {
      DATA_LAKE_BUCKET_NAME = var.data_lake_bucket_name
    })
  }
}

resource "aws_lambda_function" "load_prowler_results" {
  function_name    = "${var.name_prefix}-load-prowler-results"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 30
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, {
      PROWLER_FINDINGS_BUCKET = var.prowler_findings_bucket
    })
  }
}

resource "aws_lambda_function" "load_trivy_results" {
  function_name    = "${var.name_prefix}-load-trivy-results"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 30
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, {
      PROWLER_FINDINGS_BUCKET = var.prowler_findings_bucket
    })
  }
}

resource "aws_lambda_function" "load_komiser_results" {
  function_name    = "${var.name_prefix}-load-komiser-results"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 30
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, {
      PROWLER_FINDINGS_BUCKET = var.prowler_findings_bucket
    })
  }
}

resource "aws_lambda_function" "aggregate_audit" {
  function_name    = "${var.name_prefix}-aggregate-audit"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 180
  memory_size      = 512
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, local.audit_env, {
      APPSYNC_ENDPOINT        = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY         = "placeholder"
      BEDROCK_MODEL_ID        = var.bedrock_model_id
      PROWLER_FINDINGS_BUCKET = var.prowler_findings_bucket
    })
  }

  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_lambda_function" "fail_audit" {
  function_name    = "${var.name_prefix}-fail-audit"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 30
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, {
      APPSYNC_ENDPOINT = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY  = "placeholder"
    })
  }

  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_lambda_function" "alert_dispatcher" {
  function_name    = "${var.name_prefix}-alert-dispatcher"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 60
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, local.audit_env)
  }
}

# Business ETL (Python): i18n + Bedrock classifier + AWS Pricing API
resource "aws_lambda_function" "business_etl_aggregator" {
  function_name    = "${var.name_prefix}-business-etl-aggregator"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.11"
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.bootstrap_python.output_path
  source_code_hash = data.archive_file.bootstrap_python.output_base64sha256
  timeout          = 600
  memory_size      = 1024
  architectures    = ["x86_64"]

  environment {
    variables = merge(local.core_env, {
      DYNAMODB_TABLE_NAME     = var.table_name
      BEDROCK_MODEL_ID        = var.bedrock_model_id
      BEDROCK_REGION          = data.aws_region.current.name
      PROWLER_FINDINGS_BUCKET = var.prowler_findings_bucket
      AUDIT_DETAIL_TTL_DAYS   = "14"
      ETL_BEDROCK_MAX         = "40"
      ETL_BEDROCK_SEVERITIES  = "CRITICAL,HIGH,MEDIUM"
      FRIENDLY_COPY_TTL_DAYS  = "90"
      PRICING_CACHE_TTL_DAYS  = "14"
    })
  }
}

# Refresh semanal del catálogo de precios (Dynamo SYSTEM#AWS_PRICING)
resource "aws_cloudwatch_event_rule" "pricing_cache_weekly" {
  name                = "${var.name_prefix}-pricing-cache-weekly"
  description         = "Weekly AWS Price List refresh into Dynamo cache"
  schedule_expression = "cron(0 6 ? * MON *)"
}

resource "aws_cloudwatch_event_target" "pricing_cache_weekly" {
  rule      = aws_cloudwatch_event_rule.pricing_cache_weekly.name
  target_id = "business-etl-pricing-refresh"
  arn       = aws_lambda_function.business_etl_aggregator.arn
  input = jsonencode({
    job  = "pricing_cache_weekly_refresh"
    mode = "pricing_refresh"
  })
}

resource "aws_lambda_permission" "pricing_cache_weekly" {
  statement_id  = "AllowEventBridgePricingCacheWeekly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.business_etl_aggregator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.pricing_cache_weekly.arn
}

data "aws_region" "current" {}

data "archive_file" "bootstrap_python" {
  type        = "zip"
  output_path = "${path.module}/.artifacts/bootstrap_python.zip"

  source {
    filename = "handler.py"
    content  = <<-EOT
      def lambda_handler(event, context):
          return {
              "ok": False,
              "message": "Bootstrap Python. Real code is published by deploy-lambdas workflow.",
          }
    EOT
  }
}
