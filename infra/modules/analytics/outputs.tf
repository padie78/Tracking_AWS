output "glue_database_name" {
  value = aws_glue_catalog_database.finops.name
}

output "athena_workgroup_name" {
  value = aws_athena_workgroup.finops.name
}
