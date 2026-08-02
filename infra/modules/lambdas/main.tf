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
      SCAN_QUEUE_URL   = var.scan_queue_url
      APPSYNC_ENDPOINT = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY  = "placeholder"
    })
  }

  lifecycle {
    ignore_changes = [environment]
  }
}

# ─────────── HTTP scan ingestion ───────────

resource "aws_lambda_function" "scan_ingestion" {
  function_name    = "${var.name_prefix}-scan-ingestion"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 15
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, local.scanner_env, {
      SCAN_QUEUE_URL        = var.scan_queue_url
      SCAN_INGESTION_SECRET = var.scan_ingestion_secret
    })
  }
}

# ─────────── SQS consumers ───────────

resource "aws_lambda_function" "inventory_scanner" {
  function_name    = "${var.name_prefix}-inventory-scanner"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 120
  memory_size      = 512
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, {
      RIGHTSIZING_QUEUE_URL   = var.rightsizing_queue_url
      MODERNIZATION_QUEUE_URL = var.modernization_queue_url
      ORPHANED_QUEUE_URL      = var.orphaned_queue_url
      APPSYNC_ENDPOINT        = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY         = "placeholder"
    })
  }

  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_lambda_function" "rightsizing_analyzer" {
  function_name    = "${var.name_prefix}-rightsizing-analyzer"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 120
  memory_size      = 512
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

resource "aws_lambda_function" "modernization_analyzer" {
  function_name    = "${var.name_prefix}-modernization-analyzer"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 120
  memory_size      = 512
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

resource "aws_lambda_function" "orphaned_analyzer" {
  function_name    = "${var.name_prefix}-orphaned-analyzer"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 120
  memory_size      = 512
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

resource "aws_lambda_function" "dossier_generator" {
  function_name    = "${var.name_prefix}-dossier-generator"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 180
  memory_size      = 512
  architectures    = ["arm64"]

  environment {
    variables = merge(local.core_env, {
      BEDROCK_MODEL_ID = var.bedrock_model_id
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
      APPSYNC_ENDPOINT = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY  = "placeholder"
      BEDROCK_MODEL_ID = var.bedrock_model_id
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

# ─────────── Event source mappings (SQS → Lambda) ───────────

resource "aws_lambda_event_source_mapping" "inventory_scanner" {
  event_source_arn                   = var.scan_queue_arn
  function_name                      = aws_lambda_function.inventory_scanner.arn
  batch_size                         = 5
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

resource "aws_lambda_event_source_mapping" "rightsizing_analyzer" {
  event_source_arn                   = var.rightsizing_queue_arn
  function_name                      = aws_lambda_function.rightsizing_analyzer.arn
  batch_size                         = 5
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

resource "aws_lambda_event_source_mapping" "modernization_analyzer" {
  event_source_arn                   = var.modernization_queue_arn
  function_name                      = aws_lambda_function.modernization_analyzer.arn
  batch_size                         = 5
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

resource "aws_lambda_event_source_mapping" "orphaned_analyzer" {
  event_source_arn                   = var.orphaned_queue_arn
  function_name                      = aws_lambda_function.orphaned_analyzer.arn
  batch_size                         = 5
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

resource "aws_lambda_event_source_mapping" "dossier_generator" {
  event_source_arn                   = var.dossier_queue_arn
  function_name                      = aws_lambda_function.dossier_generator.arn
  batch_size                         = 2
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

# ─────────── HTTP API (scan ingestion) ───────────

resource "aws_apigatewayv2_api" "ingestion" {
  name          = "${var.name_prefix}-ingestion"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["content-type", "x-scan-secret", "authorization"]
    allow_methods = ["POST", "OPTIONS"]
    allow_origins = ["*"]
    max_age       = 3600
  }

  tags = {
    Layer = "event-network"
  }
}

resource "aws_apigatewayv2_integration" "scan_ingestion" {
  api_id                 = aws_apigatewayv2_api.ingestion.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.scan_ingestion.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "scan" {
  api_id    = aws_apigatewayv2_api.ingestion.id
  route_key = "POST /scan"
  target    = "integrations/${aws_apigatewayv2_integration.scan_ingestion.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.ingestion.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw_scan_ingestion" {
  statement_id  = "AllowAPIGatewayInvokeScanIngestion"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scan_ingestion.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ingestion.execution_arn}/*/*"
}
