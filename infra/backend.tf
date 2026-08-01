terraform {
  backend "s3" {
    encrypt = true
    # bucket, key, region y dynamodb_table se pasan con `-backend-config=`.
  }
}
