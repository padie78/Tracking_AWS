output "appsync_api_arn" {
  value = aws_lambda_function.appsync_api.arn
}

output "appsync_api_name" {
  value = aws_lambda_function.appsync_api.function_name
}

output "scan_ingestion_name" {
  value = aws_lambda_function.scan_ingestion.function_name
}

output "inventory_scanner_name" {
  value = aws_lambda_function.inventory_scanner.function_name
}

output "rightsizing_analyzer_name" {
  value = aws_lambda_function.rightsizing_analyzer.function_name
}

output "modernization_analyzer_name" {
  value = aws_lambda_function.modernization_analyzer.function_name
}

output "orphaned_analyzer_name" {
  value = aws_lambda_function.orphaned_analyzer.function_name
}

output "dossier_generator_name" {
  value = aws_lambda_function.dossier_generator.function_name
}

output "resolve_account_arn" {
  value = aws_lambda_function.resolve_account.arn
}

output "resolve_account_name" {
  value = aws_lambda_function.resolve_account.function_name
}

output "cloudquery_inventory_arn" {
  value = aws_lambda_function.cloudquery_inventory.arn
}

output "cloudquery_inventory_name" {
  value = aws_lambda_function.cloudquery_inventory.function_name
}

output "prowler_security_arn" {
  value = aws_lambda_function.load_prowler_results.arn
}

output "prowler_security_name" {
  value = aws_lambda_function.load_prowler_results.function_name
}

output "load_prowler_results_arn" {
  value = aws_lambda_function.load_prowler_results.arn
}

output "load_prowler_results_name" {
  value = aws_lambda_function.load_prowler_results.function_name
}

output "aggregate_audit_arn" {
  value = aws_lambda_function.aggregate_audit.arn
}

output "aggregate_audit_name" {
  value = aws_lambda_function.aggregate_audit.function_name
}

output "fail_audit_arn" {
  value = aws_lambda_function.fail_audit.arn
}

output "fail_audit_name" {
  value = aws_lambda_function.fail_audit.function_name
}

output "alert_dispatcher_arn" {
  value = aws_lambda_function.alert_dispatcher.arn
}

output "alert_dispatcher_name" {
  value = aws_lambda_function.alert_dispatcher.function_name
}

output "lambda_exec_role_arn" {
  value = aws_iam_role.lambda_exec.arn
}

output "lambda_exec_role_name" {
  value = aws_iam_role.lambda_exec.name
}

output "ingestion_api_endpoint" {
  value = aws_apigatewayv2_api.ingestion.api_endpoint
}

output "scan_url" {
  value = "${aws_apigatewayv2_api.ingestion.api_endpoint}/scan"
}
