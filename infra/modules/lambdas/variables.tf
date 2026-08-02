variable "name_prefix" {
  type = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "scan_queue_url" {
  type = string
}

variable "scan_queue_arn" {
  type = string
}

variable "scan_dlq_arn" {
  type    = string
  default = ""
}

variable "rightsizing_queue_url" {
  type = string
}

variable "rightsizing_queue_arn" {
  type = string
}

variable "rightsizing_dlq_arn" {
  type    = string
  default = ""
}

variable "modernization_queue_url" {
  type = string
}

variable "modernization_queue_arn" {
  type = string
}

variable "modernization_dlq_arn" {
  type    = string
  default = ""
}

variable "orphaned_queue_url" {
  type = string
}

variable "orphaned_queue_arn" {
  type = string
}

variable "orphaned_dlq_arn" {
  type    = string
  default = ""
}

variable "dossier_queue_url" {
  type = string
}

variable "dossier_queue_arn" {
  type = string
}

variable "dossier_dlq_arn" {
  type    = string
  default = ""
}

variable "bedrock_model_id" {
  type    = string
  default = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "scan_ingestion_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "connect_template_url" {
  type        = string
  description = "HTTPS URL pública del CloudFormation customer-role.yaml"
}

variable "scanner_account_id" {
  type        = string
  description = "Account ID de Track_AWS (para trust policy del cliente)"
}

variable "audit_state_machine_arn" {
  type    = string
  default = ""
}

variable "audit_event_bus_name" {
  type    = string
  default = "default"
}

variable "audit_alerts_topic_arn" {
  type    = string
  default = ""
}

variable "reports_bucket_name" {
  type = string
}

variable "reports_bucket_arn" {
  type = string
}

variable "prowler_findings_bucket" {
  type = string
}

variable "prowler_findings_bucket_arn" {
  type = string
}

variable "data_lake_bucket_name" {
  type = string
}

variable "data_lake_bucket_arn" {
  type = string
}
