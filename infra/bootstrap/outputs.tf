output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "state_bucket_arn" {
  value = aws_s3_bucket.state.arn
}

output "locks_table" {
  value = aws_dynamodb_table.locks.name
}

output "locks_table_arn" {
  value = aws_dynamodb_table.locks.arn
}
