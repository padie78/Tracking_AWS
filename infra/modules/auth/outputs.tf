output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}

output "web_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = aws_cognito_user_pool_domain.this.domain
}

output "cognito_hosted_ui_base_url" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "post_confirmation_name" {
  value = aws_lambda_function.post_confirmation.function_name
}
