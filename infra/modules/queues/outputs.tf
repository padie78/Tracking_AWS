output "queue_urls" {
  value = { for k, v in aws_sqs_queue.main : k => v.url }
}

output "queue_arns" {
  value = { for k, v in aws_sqs_queue.main : k => v.arn }
}

output "dlq_arns" {
  value = { for k, v in aws_sqs_queue.dlq : k => v.arn }
}

output "scan_queue_url" {
  value = aws_sqs_queue.main["scan"].url
}

output "scan_queue_arn" {
  value = aws_sqs_queue.main["scan"].arn
}

output "rightsizing_queue_url" {
  value = aws_sqs_queue.main["rightsizing"].url
}

output "rightsizing_queue_arn" {
  value = aws_sqs_queue.main["rightsizing"].arn
}

output "modernization_queue_url" {
  value = aws_sqs_queue.main["modernization"].url
}

output "modernization_queue_arn" {
  value = aws_sqs_queue.main["modernization"].arn
}

output "orphaned_queue_url" {
  value = aws_sqs_queue.main["orphaned"].url
}

output "orphaned_queue_arn" {
  value = aws_sqs_queue.main["orphaned"].arn
}

output "dossier_queue_url" {
  value = aws_sqs_queue.main["dossier"].url
}

output "dossier_queue_arn" {
  value = aws_sqs_queue.main["dossier"].arn
}
