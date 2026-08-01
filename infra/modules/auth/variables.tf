variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "domain_prefix" {
  type = string
}

variable "oauth_callback_urls" {
  type = list(string)
}

variable "oauth_logout_urls" {
  type = list(string)
}

variable "enable_google_idp" {
  type    = bool
  default = false
}

variable "google_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
