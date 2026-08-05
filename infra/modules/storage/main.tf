data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Artefactos no sensibles (exports de dossiers, assets UI)
resource "aws_s3_bucket" "artifacts" {
  bucket        = "${var.name_prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cold path — CUR / Parquet (sin dumps crudos)
resource "aws_s3_bucket" "data_lake" {
  bucket        = "${var.name_prefix}-data-lake-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data_lake" {
  bucket                  = aws_s3_bucket.data_lake.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id

  rule {
    id     = "cur-to-glacier"
    status = "Enabled"

    filter {
      prefix = "cur/"
    }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }
  }

  # Dev / costo $0: purga Parquet de motores (default 7 días). Prod: expire_days = 0.
  dynamic "rule" {
    for_each = var.data_lake_engine_expire_days > 0 ? toset([
      "cloudquery",
      "prowler",
      "trivy",
      "komiser",
      "infracost",
    ]) : toset([])
    content {
      id     = "expire-${rule.key}-parquet"
      status = "Enabled"
      filter {
        prefix = "${rule.key}/"
      }
      expiration {
        days = var.data_lake_engine_expire_days
      }
    }
  }
}
