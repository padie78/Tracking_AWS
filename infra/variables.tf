variable "project_name" {
  type    = string
  default = "track-aws"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "appsync_graphql_api_name" {
  type    = string
  default = "api"
}

variable "bedrock_model_id" {
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
  description = "Bedrock model ID for audit report generation."
}

variable "tags" {
  type    = map(string)
  default = {}
}
