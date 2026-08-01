# Inventario AWS efímero (AssumeRole)

1. El adaptador `AssumeRoleAwsInventoryAdapter` asume el rol del cliente (`sts:AssumeRole` + ExternalId) y lee EC2/EBS/EIP/CloudWatch **solo en memoria** del invocation Lambda.
2. El snapshot viaja al hop SQS de analyzers como `inventoryPayload` y **no** se escribe a DynamoDB ni a S3 como dump crudo.
3. En DynamoDB solo persisten: vínculo de cuenta (`roleArn`, `externalId`, status), `ScanJob`, `Finding` agregados y `SavingsDossier`.
4. Ver también `integrations/connect-account/README.md`.
