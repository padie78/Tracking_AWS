variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "aws_account_id" {
  type        = string
  description = "Account ID de AWS. Forma parte del nombre del bucket."
}

variable "project_name" {
  type    = string
  default = "track-aws"
}

variable "state_bucket_name_override" {
  type    = string
  default = null
}

variable "locks_table_name_override" {
  type    = string
  default = null
}
