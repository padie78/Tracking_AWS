variable "name_prefix" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "message_retention_seconds" {
  type    = number
  default = 345600
}

variable "dlq_retention_seconds" {
  type    = number
  default = 1209600
}

variable "max_receive_count" {
  type    = number
  default = 3
}

variable "dlq_visibility_timeout_seconds" {
  type    = number
  default = 120
}
