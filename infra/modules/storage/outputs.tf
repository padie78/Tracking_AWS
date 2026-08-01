output "artifacts_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "artifacts_bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}

output "data_lake_bucket_name" {
  value = aws_s3_bucket.data_lake.bucket
}

output "data_lake_bucket_arn" {
  value = aws_s3_bucket.data_lake.arn
}

# Alias para compatibilidad con wiring analytics (statsGames usaba profiles)
output "profiles_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "profiles_bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}

output "connect_template_url" {
  value = "https://${aws_s3_bucket.connect_templates.bucket}.s3.${data.aws_region.current.name}.amazonaws.com/${aws_s3_object.customer_role_template.key}"
}

output "connect_templates_bucket_name" {
  value = aws_s3_bucket.connect_templates.bucket
}

output "reports_bucket_name" {
  value = aws_s3_bucket.reports.bucket
}

output "reports_bucket_arn" {
  value = aws_s3_bucket.reports.arn
}
