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

variable "tags" {
  type    = map(string)
  default = {}
}

variable "prowler_image_tag" {
  type        = string
  default     = "latest"
  description = "Tag de la imagen en ECR (pusheada por CI o build local)"
}

variable "task_cpu" {
  type    = string
  default = "1024"
}

variable "task_memory" {
  type    = string
  default = "2048"
}
