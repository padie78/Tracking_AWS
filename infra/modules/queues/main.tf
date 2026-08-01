locals {
  queues = {
    scan = {
      description        = "SCAN — startScan / HTTP ingestion → inventory scanner."
      visibility_timeout = 120
    }
    rightsizing = {
      description        = "RIGHTSIZING — EC2 underutilization analyzer."
      visibility_timeout = 120
    }
    modernization = {
      description        = "MODERNIZATION — instance family migration analyzer."
      visibility_timeout = 120
    }
    orphaned = {
      description        = "ORPHANED — unattached EBS / inactive EIP analyzer."
      visibility_timeout = 120
    }
    dossier = {
      description        = "DOSSIER — Bedrock savings dossier generator."
      visibility_timeout = 180
    }
  }
}

resource "aws_sqs_queue" "dlq" {
  for_each = local.queues

  name                       = "${var.name_prefix}-${replace(each.key, "_", "-")}-dlq"
  message_retention_seconds  = var.dlq_retention_seconds
  visibility_timeout_seconds = var.dlq_visibility_timeout_seconds
  sqs_managed_sse_enabled    = true

  tags = merge(var.tags, {
    Name        = "${var.name_prefix}-${replace(each.key, "_", "-")}-dlq"
    LogicalName = upper("${each.key}_DLQ")
    Layer       = "event-network"
  })
}

resource "aws_sqs_queue" "main" {
  for_each = local.queues

  name                       = "${var.name_prefix}-${replace(each.key, "_", "-")}"
  visibility_timeout_seconds = each.value.visibility_timeout
  message_retention_seconds  = var.message_retention_seconds
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = merge(var.tags, {
    Name        = "${var.name_prefix}-${replace(each.key, "_", "-")}"
    LogicalName = upper(each.key)
    Layer       = "event-network"
  })
}
