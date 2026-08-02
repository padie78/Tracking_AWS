variable "name_prefix" {
  type = string
}

variable "resolve_account_arn" {
  type = string
}

variable "cloudquery_inventory_arn" {
  type = string
}

variable "load_prowler_results_arn" {
  type = string
}

variable "load_trivy_results_arn" {
  type = string
}

variable "aggregate_audit_arn" {
  type = string
}

variable "fail_audit_arn" {
  type = string
}

variable "prowler_cluster_arn" {
  type = string
}

variable "prowler_task_definition_arn" {
  type = string
}

variable "trivy_task_definition_arn" {
  type = string
}

variable "prowler_container_name" {
  type    = string
  default = "prowler"
}

variable "trivy_container_name" {
  type    = string
  default = "trivy"
}

variable "prowler_subnet_ids" {
  type = list(string)
}

variable "prowler_security_group_id" {
  type = string
}

variable "prowler_task_role_arn" {
  type = string
}

variable "prowler_execution_role_arn" {
  type = string
}

variable "prowler_findings_bucket" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
