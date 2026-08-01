# Stub mínimo — Glue DB + Athena workgroup para CUR frío futuro.
# No crawlers ni tablas por plataforma en el MVP.

resource "aws_glue_catalog_database" "finops" {
  name = "${replace(var.name_prefix, "-", "_")}_finops_lake"
}

resource "aws_athena_workgroup" "finops" {
  name = "${var.name_prefix}-finops"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${var.data_lake_bucket_name}/athena-results/"
    }
  }
}
