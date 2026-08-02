variable "name_prefix" {
  type = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "bedrock_model_id" {
  type    = string
  default = "anthropic.claude-3-haiku-20240307-v1:0"
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
