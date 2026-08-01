output "table_name" {
  description = "Nombre físico de la tabla operativa single-table ({prefix}-core)."
  value       = aws_dynamodb_table.core.name
}

output "table_arn" {
  value = aws_dynamodb_table.core.arn
}

output "core_table_name" {
  description = "Alias explícito de table_name."
  value       = aws_dynamodb_table.core.name
}
