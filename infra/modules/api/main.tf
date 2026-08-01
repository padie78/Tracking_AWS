data "aws_region" "current" {}

locals {
  api_datasource_name = "api"
}

resource "aws_appsync_graphql_api" "this" {
  name                = var.graphql_api_name
  authentication_type = "API_KEY"
  schema              = file("${path.module}/schema.graphql")

  additional_authentication_provider {
    authentication_type = "AMAZON_COGNITO_USER_POOLS"
    user_pool_config {
      user_pool_id = var.cognito_user_pool_id
      aws_region   = data.aws_region.current.name
    }
  }

  log_config {
    cloudwatch_logs_role_arn = aws_iam_role.appsync_logs.arn
    field_log_level          = "ERROR"
  }

  xray_enabled = true
}

resource "aws_appsync_api_key" "this" {
  api_id  = aws_appsync_graphql_api.this.id
  expires = timeadd(timestamp(), "8760h")
  lifecycle {
    ignore_changes = [expires]
  }
}

data "aws_iam_policy_document" "appsync_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["appsync.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "appsync_invoke" {
  name               = "${var.name_prefix}-appsync-invoke"
  assume_role_policy = data.aws_iam_policy_document.appsync_assume.json
}

data "aws_iam_policy_document" "appsync_invoke_policy" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.appsync_api_arn]
  }
}

resource "aws_iam_role_policy" "appsync_invoke" {
  name   = "${var.name_prefix}-appsync-invoke"
  role   = aws_iam_role.appsync_invoke.id
  policy = data.aws_iam_policy_document.appsync_invoke_policy.json
}

resource "aws_iam_role" "appsync_logs" {
  name               = "${var.name_prefix}-appsync-logs"
  assume_role_policy = data.aws_iam_policy_document.appsync_assume.json
}

resource "aws_iam_role_policy_attachment" "appsync_logs" {
  role       = aws_iam_role.appsync_logs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs"
}

resource "aws_appsync_datasource" "api" {
  api_id           = aws_appsync_graphql_api.this.id
  name             = local.api_datasource_name
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_invoke.arn

  lambda_config {
    function_arn = var.appsync_api_arn
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_appsync_datasource" "none" {
  api_id = aws_appsync_graphql_api.this.id
  name   = "none"
  type   = "NONE"
}

locals {
  direct_lambda_request_template  = <<-EOT
    {
      "version": "2018-05-29",
      "operation": "Invoke",
      "payload": $util.toJson($context)
    }
  EOT
  direct_lambda_response_template = <<-EOT
    #if($context.error)
      $util.error($context.error.message, $context.error.type)
    #end
    $util.toJson($context.result)
  EOT
}

resource "terraform_data" "appsync_datasources_ready" {
  depends_on = [aws_appsync_datasource.api]
}

resource "aws_appsync_resolver" "health" {
  api_id      = aws_appsync_graphql_api.this.id
  type        = "Query"
  field       = "health"
  data_source = aws_appsync_datasource.none.name

  request_template  = <<-VTPL
    {
      "version": "2018-05-29",
      "payload": {}
    }
  VTPL
  response_template = <<-VTPL
    $util.toJson("ok")
  VTPL
}

resource "aws_appsync_resolver" "publish_scan_status_changed" {
  api_id      = aws_appsync_graphql_api.this.id
  type        = "Mutation"
  field       = "publishScanStatusChanged"
  data_source = aws_appsync_datasource.none.name

  request_template  = <<-VTPL
    {
      "version": "2018-05-29",
      "payload": $util.toJson($ctx.args.input)
    }
  VTPL
  response_template = <<-VTPL
    $util.toJson($ctx.result)
  VTPL
}

resource "aws_appsync_resolver" "publish_finding_ready" {
  api_id      = aws_appsync_graphql_api.this.id
  type        = "Mutation"
  field       = "publishFindingReady"
  data_source = aws_appsync_datasource.none.name

  request_template  = <<-VTPL
    {
      "version": "2018-05-29",
      "payload": $util.toJson($ctx.args.input)
    }
  VTPL
  response_template = <<-VTPL
    $util.toJson($ctx.result)
  VTPL
}

resource "aws_appsync_resolver" "publish_dossier_ready" {
  api_id      = aws_appsync_graphql_api.this.id
  type        = "Mutation"
  field       = "publishDossierReady"
  data_source = aws_appsync_datasource.none.name

  request_template  = <<-VTPL
    {
      "version": "2018-05-29",
      "payload": $util.toJson($ctx.args.input)
    }
  VTPL
  response_template = <<-VTPL
    $util.toJson($ctx.result)
  VTPL
}

resource "aws_appsync_resolver" "publish_audit_status_changed" {
  api_id      = aws_appsync_graphql_api.this.id
  type        = "Mutation"
  field       = "publishAuditStatusChanged"
  data_source = aws_appsync_datasource.none.name

  request_template  = <<-VTPL
    {
      "version": "2018-05-29",
      "payload": $util.toJson($ctx.args.input)
    }
  VTPL
  response_template = <<-VTPL
    $util.toJson($ctx.result)
  VTPL
}

resource "aws_appsync_resolver" "ping" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Query"
  field             = "ping"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "list_findings_by_scan" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Query"
  field             = "listFindingsByScan"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "get_savings_dossier" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Query"
  field             = "getSavingsDossier"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "start_scan" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Mutation"
  field             = "startScan"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "link_aws_account" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Mutation"
  field             = "linkAwsAccount"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "verify_aws_account_link" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Mutation"
  field             = "verifyAwsAccountLink"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "list_aws_accounts" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Query"
  field             = "listAwsAccounts"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "list_audits" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Query"
  field             = "listAudits"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "list_audit_findings" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Query"
  field             = "listAuditFindings"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "start_audit" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Mutation"
  field             = "startAudit"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "generate_savings_dossier" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Mutation"
  field             = "generateSavingsDossier"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "list_alert_channels" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Query"
  field             = "listAlertChannels"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "upsert_alert_channel" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Mutation"
  field             = "upsertAlertChannel"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}

resource "aws_appsync_resolver" "delete_alert_channel" {
  api_id            = aws_appsync_graphql_api.this.id
  type              = "Mutation"
  field             = "deleteAlertChannel"
  data_source       = aws_appsync_datasource.api.name
  depends_on        = [terraform_data.appsync_datasources_ready]
  request_template  = local.direct_lambda_request_template
  response_template = local.direct_lambda_response_template
}
