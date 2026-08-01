data "aws_caller_identity" "current" {}

resource "aws_cloudwatch_event_bus" "audit" {
  name = "${var.name_prefix}-audit"
}

resource "aws_sns_topic" "audit_alerts" {
  name = "${var.name_prefix}-audit-alerts"
}

# CRITICAL/HIGH security (compat)
resource "aws_cloudwatch_event_rule" "critical_findings" {
  name           = "${var.name_prefix}-audit-critical"
  event_bus_name = aws_cloudwatch_event_bus.audit.name
  event_pattern = jsonencode({
    source      = ["trackaws.audit"]
    detail-type = ["AuditCriticalFindings"]
    detail = {
      severity = ["CRITICAL", "HIGH"]
    }
  })
}

resource "aws_cloudwatch_event_target" "sns_critical" {
  rule           = aws_cloudwatch_event_rule.critical_findings.name
  event_bus_name = aws_cloudwatch_event_bus.audit.name
  target_id      = "AuditAlertsSnsCritical"
  arn            = aws_sns_topic.audit_alerts.arn
}

# Digest completo: seguridad + tips de ahorro + inconsistencias
resource "aws_cloudwatch_event_rule" "customer_digest" {
  name           = "${var.name_prefix}-audit-digest"
  event_bus_name = aws_cloudwatch_event_bus.audit.name
  event_pattern = jsonencode({
    source      = ["trackaws.audit"]
    detail-type = ["AuditCustomerDigest"]
  })
}

resource "aws_cloudwatch_event_target" "sns_digest" {
  rule           = aws_cloudwatch_event_rule.customer_digest.name
  event_bus_name = aws_cloudwatch_event_bus.audit.name
  target_id      = "AuditAlertsSnsDigest"
  arn            = aws_sns_topic.audit_alerts.arn
}

resource "aws_cloudwatch_event_target" "dispatcher_digest" {
  count          = var.alert_dispatcher_arn != "" ? 1 : 0
  rule           = aws_cloudwatch_event_rule.customer_digest.name
  event_bus_name = aws_cloudwatch_event_bus.audit.name
  target_id      = "AuditAlertDispatcher"
  arn            = var.alert_dispatcher_arn
}

resource "aws_lambda_permission" "events_invoke_dispatcher" {
  count         = var.alert_dispatcher_arn != "" ? 1 : 0
  statement_id  = "AllowEventBridgeInvokeAlertDispatcher"
  action        = "lambda:InvokeFunction"
  function_name = var.alert_dispatcher_arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.customer_digest.arn
}

data "aws_iam_policy_document" "sns_from_events" {
  statement {
    effect  = "Allow"
    actions = ["sns:Publish"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    resources = [aws_sns_topic.audit_alerts.arn]
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values = [
        aws_cloudwatch_event_rule.critical_findings.arn,
        aws_cloudwatch_event_rule.customer_digest.arn,
      ]
    }
  }
}

resource "aws_sns_topic_policy" "audit_alerts" {
  arn    = aws_sns_topic.audit_alerts.arn
  policy = data.aws_iam_policy_document.sns_from_events.json
}
