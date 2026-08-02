output "cluster_arn" {
  value = aws_ecs_cluster.prowler.arn
}

output "cluster_name" {
  value = aws_ecs_cluster.prowler.name
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.prowler.arn
}

output "task_definition_family" {
  value = aws_ecs_task_definition.prowler.family
}

output "subnet_ids" {
  value = aws_subnet.public[*].id
}

output "security_group_id" {
  value = aws_security_group.prowler_tasks.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.prowler.repository_url
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "container_name" {
  value = "prowler"
}

output "trivy_task_definition_arn" {
  value = aws_ecs_task_definition.trivy.arn
}

output "trivy_container_name" {
  value = "trivy"
}

output "trivy_ecr_repository_url" {
  value = aws_ecr_repository.trivy.repository_url
}

output "findings_key_prefix" {
  value = "tenants"
}
