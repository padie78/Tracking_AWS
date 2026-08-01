# Terraform Bootstrap — Track_AWS

Crea el backend remoto (una sola vez, state local):

- Bucket S3 versionado/cifrado para `terraform.tfstate`
- Tabla DynamoDB de locks (`LockID`)

```bash
cd infra/bootstrap
terraform init
terraform apply \
  -var "aws_account_id=<TU_ACCOUNT_ID>" \
  -var "aws_region=eu-central-1"
```

Luego, en `infra/`:

```bash
terraform init \
  -backend-config="bucket=$(terraform -chdir=../bootstrap output -raw state_bucket)" \
  -backend-config="key=dev/terraform.tfstate" \
  -backend-config="region=eu-central-1" \
  -backend-config="dynamodb_table=$(terraform -chdir=../bootstrap output -raw locks_table)"
```
