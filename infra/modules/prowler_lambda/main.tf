resource "aws_ecr_repository" "prowler" {
  name                 = "${var.name_prefix}-prowler"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "prowler" {
  repository = aws_ecr_repository.prowler.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "prowler" {
  name              = "/aws/lambda/${var.name_prefix}-prowler"
  retention_in_days = 30
  tags              = var.tags
}

data "aws_iam_policy_document" "prowler_ecr_pull" {
  statement {
    sid    = "EcrAuthToken"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPullProwlerImage"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = [aws_ecr_repository.prowler.arn]
  }
}

resource "aws_iam_role_policy" "prowler_ecr_pull" {
  name   = "${var.name_prefix}-prowler-ecr-pull"
  role   = var.lambda_exec_role_name
  policy = data.aws_iam_policy_document.prowler_ecr_pull.json
}

# Imagen oficial Prowler empaquetada para Lambda (push vía CI / push-image.sh).
# Primera creación falla sin :latest en ECR — ver README bootstrap.
resource "aws_lambda_function" "prowler" {
  function_name = "${var.name_prefix}-prowler"
  role          = var.lambda_exec_role_arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.prowler.repository_url}:${var.prowler_image_tag}"
  timeout       = var.timeout_seconds
  memory_size   = var.memory_size
  architectures = ["arm64"]

  ephemeral_storage {
    size = var.ephemeral_storage_mb
  }

  image_config {
    command = ["handler.handler"]
  }

  environment {
    variables = {
      OUTPUT_BUCKET           = var.artifacts_bucket_name
      PROWLER_FINDINGS_BUCKET = var.artifacts_bucket_name
      LOG_LEVEL               = "INFO"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.prowler,
    aws_iam_role_policy.prowler_ecr_pull,
  ]

  tags = var.tags

  lifecycle {
    # CI actualiza la imagen; Terraform no la pisa
    ignore_changes = [image_uri]
  }
}
