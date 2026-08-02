variable "name_prefix" {
  type = string
}

variable "data_lake_engine_expire_days" {
  type        = number
  description = "Días hasta expirar Parquet cloudquery/prowler/trivy/infracost. 0 = no expirar (prod). Default 7 para costo ~$0 en dev."
  default     = 7
}
