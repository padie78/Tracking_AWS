# Producers

El pipeline FinOps HTTP/`startScan` + SQS fue retirado. Los audits se disparan con `startAudit` (AppSync → Step Functions).
