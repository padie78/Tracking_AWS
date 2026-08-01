output "state_machine_arn" {
  value = aws_sfn_state_machine.audit.arn
}

output "state_machine_name" {
  value = aws_sfn_state_machine.audit.name
}

output "sfn_role_arn" {
  value = aws_iam_role.sfn.arn
}
