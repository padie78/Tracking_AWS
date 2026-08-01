output "ecr_repository_url" {
  value = aws_ecr_repository.prowler.repository_url
}

output "prowler_lambda_arn" {
  value = aws_lambda_function.prowler.arn
}

output "prowler_lambda_name" {
  value = aws_lambda_function.prowler.function_name
}
