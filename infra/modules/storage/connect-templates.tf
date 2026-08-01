# Bucket público mínimo: solo plantilla CloudFormation del rol cliente (quick-create).
resource "aws_s3_bucket" "connect_templates" {
  bucket        = "${var.name_prefix}-connect-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "connect_templates" {
  bucket                  = aws_s3_bucket.connect_templates.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_ownership_controls" "connect_templates" {
  bucket = aws_s3_bucket.connect_templates.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "connect_templates" {
  bucket = aws_s3_bucket.connect_templates.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_object" "customer_role_template" {
  bucket       = aws_s3_bucket.connect_templates.id
  key          = "customer-role.yaml"
  source       = "${path.module}/../../../integrations/connect-account/customer-role.yaml"
  etag         = filemd5("${path.module}/../../../integrations/connect-account/customer-role.yaml")
  content_type = "text/yaml"

  depends_on = [
    aws_s3_bucket_public_access_block.connect_templates,
    aws_s3_bucket_ownership_controls.connect_templates,
  ]
}

data "aws_iam_policy_document" "connect_templates_public_read" {
  statement {
    sid     = "PublicReadConnectTemplate"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    resources = ["${aws_s3_bucket.connect_templates.arn}/customer-role.yaml"]
  }
}

resource "aws_s3_bucket_policy" "connect_templates" {
  bucket = aws_s3_bucket.connect_templates.id
  policy = data.aws_iam_policy_document.connect_templates_public_read.json

  depends_on = [aws_s3_bucket_public_access_block.connect_templates]
}
