# Cognito OAuth — consumido por module.auth

variable "cognito_domain_prefix" {
  type        = string
  description = "Prefijo del dominio Hosted UI de Cognito."
  default     = ""
}

variable "cognito_oauth_callback_urls" {
  type        = list(string)
  description = "URLs de redirección OAuth adicionales."
  default     = []
}

variable "cognito_oauth_logout_urls" {
  type        = list(string)
  description = "URLs de logout adicionales."
  default     = []
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

locals {
  cognito_domain_prefix = var.cognito_domain_prefix != "" ? var.cognito_domain_prefix : local.name_prefix

  cognito_oauth_callback_urls = distinct(concat(
    var.cognito_oauth_callback_urls,
    [
      "http://localhost:4200/auth/callback",
      "https://${module.frontend_hosting.distribution_domain}/auth/callback",
    ],
  ))

  cognito_oauth_logout_urls = distinct(concat(
    var.cognito_oauth_logout_urls,
    [
      "http://localhost:4200/login",
      "https://${module.frontend_hosting.distribution_domain}/login",
    ],
  ))
}
