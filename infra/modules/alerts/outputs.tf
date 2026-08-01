output "event_bus_name" {
  value = aws_cloudwatch_event_bus.audit.name
}

output "event_bus_arn" {
  value = aws_cloudwatch_event_bus.audit.arn
}

output "alerts_topic_arn" {
  value = aws_sns_topic.audit_alerts.arn
}

output "customer_digest_rule_name" {
  value = aws_cloudwatch_event_rule.customer_digest.name
}

output "customer_digest_rule_arn" {
  value = aws_cloudwatch_event_rule.customer_digest.arn
}
