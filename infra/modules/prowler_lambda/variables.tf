variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "artifacts_bucket_name" {
  type = string
}

variable "artifacts_bucket_arn" {
  type = string
}

variable "lambda_exec_role_arn" {
  type = string
}

variable "lambda_exec_role_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "prowler_image_tag" {
  type    = string
  default = "latest"
}

variable "memory_size" {
  type    = number
  default = 2048
}

variable "timeout_seconds" {
  type    = number
  default = 900
}

variable "ephemeral_storage_mb" {
  type    = number
  default = 1024
}
