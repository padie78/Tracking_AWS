data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${var.name_prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_inline" {
  statement {
    sid    = "DynamoCrud"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactWriteItems",
    ]
    resources = [var.table_arn, "${var.table_arn}/index/*"]
  }

  statement {
    sid    = "BedrockInvokeAndConverse"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:Converse",
    ]
    resources = [
      "arn:aws:bedrock:*::foundation-model/${var.bedrock_model_id}",
      "arn:aws:bedrock:*:*:inference-profile/*",
      "arn:aws:bedrock:*:*:foundation-model/${var.bedrock_model_id}",
    ]
  }

  # Price List API solo en us-east-1 (cliente boto3 ya fija esa región).
  statement {
    sid       = "AwsPricingApi"
    effect    = "Allow"
    actions   = ["pricing:GetProducts", "pricing:DescribeServices"]
    resources = ["*"]
  }

  statement {
    sid       = "AppSyncPublish"
    effect    = "Allow"
    actions   = ["appsync:GraphQL"]
    resources = ["arn:aws:appsync:*:*:apis/*"]
  }

  # Cross-account AssumeRole a roles TrackAwsScannerRole* del cliente.
  statement {
    sid     = "AssumeCustomerScannerRoles"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    resources = [
      "arn:aws:iam::*:role/TrackAwsScannerRole",
      "arn:aws:iam::*:role/TrackAwsScannerRole-*",
    ]
  }

  statement {
    sid       = "StartAuditStateMachine"
    effect    = "Allow"
    actions   = ["states:StartExecution"]
    resources = [var.audit_state_machine_arn]
  }

  statement {
    sid       = "PutAuditEvents"
    effect    = "Allow"
    actions   = ["events:PutEvents"]
    resources = ["*"]
  }

  statement {
    sid       = "PublishAuditAlerts"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = compact([var.audit_alerts_topic_arn])
  }

  statement {
    sid       = "WriteAuditReports"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:AbortMultipartUpload"]
    resources = ["${var.reports_bucket_arn}/*"]
  }

  statement {
    sid    = "WriteHistoricalDataLakeParquet"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:AbortMultipartUpload",
    ]
    resources = [
      "${var.data_lake_bucket_arn}/cloudquery/*",
      "${var.data_lake_bucket_arn}/prowler/*",
      "${var.data_lake_bucket_arn}/trivy/*",
      "${var.data_lake_bucket_arn}/infracost/*",
    ]
  }

  statement {
    sid    = "ProwlerFindingsArtifacts"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:AbortMultipartUpload",
    ]
    resources = [
      "${var.prowler_findings_bucket_arn}/tenants/*/audits/*/prowler/*",
      "${var.prowler_findings_bucket_arn}/tenants/*/audits/*/trivy/*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_inline" {
  name   = "${var.name_prefix}-lambda-inline"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_inline.json
}
