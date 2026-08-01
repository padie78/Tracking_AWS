data "archive_file" "post_confirmation_bootstrap" {
  type        = "zip"
  output_path = "${path.module}/.artifacts/post-confirmation-bootstrap.zip"

  source {
    filename = "index.js"
    content  = <<-EOT
      exports.handler = async () => ({});
    EOT
  }
}

data "aws_iam_policy_document" "post_confirmation_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "post_confirmation" {
  name               = "${var.name_prefix}-post-confirmation"
  assume_role_policy = data.aws_iam_policy_document.post_confirmation_assume.json
}

resource "aws_iam_role_policy_attachment" "post_confirmation_logs" {
  role       = aws_iam_role.post_confirmation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "post_confirmation_inline" {
  statement {
    sid    = "DynamoPutMembership"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
    ]
    resources = [var.table_arn]
  }
}

resource "aws_iam_role_policy" "post_confirmation_inline" {
  name   = "${var.name_prefix}-post-confirmation-inline"
  role   = aws_iam_role.post_confirmation.id
  policy = data.aws_iam_policy_document.post_confirmation_inline.json
}

resource "aws_lambda_function" "post_confirmation" {
  function_name    = "${var.name_prefix}-post-confirmation"
  role             = aws_iam_role.post_confirmation.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.post_confirmation_bootstrap.output_path
  source_code_hash = data.archive_file.post_confirmation_bootstrap.output_base64sha256
  timeout          = 10
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = {
      CORE_TABLE_NAME = var.table_name
      TABLE_NAME      = var.table_name
      LOG_LEVEL       = "INFO"
    }
  }
}

resource "aws_lambda_permission" "cognito_post_confirmation" {
  statement_id  = "AllowCognitoPostConfirmation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_confirmation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}
