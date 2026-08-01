variable "name_prefix" {
  type = string
}

variable "alert_dispatcher_arn" {
  type        = string
  default     = ""
  description = "ARN Lambda alert_dispatcher (opcional)"
}
