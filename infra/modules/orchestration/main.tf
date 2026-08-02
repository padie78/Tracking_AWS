data "aws_iam_policy_document" "sfn_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${var.name_prefix}-audit-sfn"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "sfn_invoke" {
  statement {
    sid     = "InvokeAuditLambdas"
    effect  = "Allow"
    actions = ["lambda:InvokeFunction"]
    resources = [
      var.resolve_account_arn,
      var.cloudquery_inventory_arn,
      var.load_prowler_results_arn,
      var.aggregate_audit_arn,
      var.fail_audit_arn,
    ]
  }

  statement {
    sid    = "RunProwlerFargate"
    effect = "Allow"
    actions = [
      "ecs:RunTask",
      "ecs:StopTask",
      "ecs:DescribeTasks",
      "ecs:TagResource",
    ]
    resources = ["*"]
  }

  statement {
    sid     = "PassProwlerRoles"
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      var.prowler_task_role_arn,
      var.prowler_execution_role_arn,
    ]
  }

  # ecs:runTask.sync crea managed rules de EventBridge
  statement {
    sid    = "EcsEventsForSync"
    effect = "Allow"
    actions = [
      "events:PutRule",
      "events:DeleteRule",
      "events:DescribeRule",
      "events:PutTargets",
      "events:RemoveTargets",
      "events:TagResource",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sfn_invoke" {
  name   = "${var.name_prefix}-audit-sfn-invoke"
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn_invoke.json
}

locals {
  lambda_retry = [
    {
      ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
      IntervalSeconds = 5
      MaxAttempts     = 2
      BackoffRate     = 2.0
    }
  ]
}

resource "aws_sfn_state_machine" "audit" {
  name     = "${var.name_prefix}-audit"
  role_arn = aws_iam_role.sfn.arn
  tags     = var.tags

  # Evita CreateStateMachine antes de que el rol tenga events:* (managed-rule)
  depends_on = [aws_iam_role_policy.sfn_invoke]

  definition = jsonencode({
    Comment = "Track_AWS: resolve → Parallel(CloudQuery Lambda ∥ Prowler Fargate) → aggregate"
    StartAt = "ResolveAccount"
    States = {
      ResolveAccount = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.resolve_account_arn
          "Payload.$"  = "$"
        }
        ResultSelector = {
          "payload.$" = "$.Payload"
        }
        ResultPath = "$.resolve"
        Retry      = local.lambda_retry
        Next       = "ParallelEngines"
        Catch = [{
          ErrorEquals = ["States.ALL"]
          ResultPath  = "$.error"
          Next        = "MarkAuditFailed"
        }]
      }
      ParallelEngines = {
        Type    = "Parallel"
        Comment = "Catch por rama: falla de CloudQuery o Prowler no aborta el audit"
        Branches = [
          {
            StartAt = "CloudQueryInventory"
            States = {
              CloudQueryInventory = {
                Type           = "Task"
                Resource       = "arn:aws:states:::lambda:invoke"
                TimeoutSeconds = 900
                Parameters = {
                  FunctionName = var.cloudquery_inventory_arn
                  "Payload.$"  = "$.resolve.payload"
                }
                Retry = local.lambda_retry
                Catch = [{
                  ErrorEquals = ["States.ALL"]
                  Next        = "CloudQueryFallback"
                }]
                Next = "CloudQuerySuccess"
              }
              CloudQuerySuccess = {
                Type = "Pass"
                Parameters = {
                  "finops.$" = "$.Payload"
                }
                End = true
              }
              CloudQueryFallback = {
                Type = "Pass"
                Result = {
                  finops = {
                    findings = []
                    inventorySummary = {
                      totalCount         = 0
                      ec2Count           = 0
                      ebsCount           = 0
                      eipCount           = 0
                      runningEc2Count    = 0
                      stoppedEc2Count    = 0
                      unattachedEbsCount = 0
                      idleEipCount       = 0
                    }
                    warning = "cloudquery_branch_failed"
                  }
                }
                End = true
              }
            }
          },
          {
            StartAt = "ProwlerFargate"
            States = {
              ProwlerFargate = {
                Type           = "Task"
                Resource       = "arn:aws:states:::ecs:runTask.sync"
                TimeoutSeconds = 900
                Parameters = {
                  LaunchType     = "FARGATE"
                  Cluster        = var.prowler_cluster_arn
                  TaskDefinition = var.prowler_task_definition_arn
                  NetworkConfiguration = {
                    AwsvpcConfiguration = {
                      Subnets        = var.prowler_subnet_ids
                      SecurityGroups = [var.prowler_security_group_id]
                      AssignPublicIp = "ENABLED"
                    }
                  }
                  Overrides = {
                    ContainerOverrides = [
                      {
                        Name = var.prowler_container_name
                        Environment = [
                          { Name = "TENANT_ID", "Value.$" = "$.resolve.payload.tenantId" },
                          { Name = "AUDIT_ID", "Value.$" = "$.resolve.payload.auditId" },
                          { Name = "ACCOUNT_ID", "Value.$" = "$.resolve.payload.accountId" },
                          { Name = "ROLE_ARN", "Value.$" = "$.resolve.payload.roleArn" },
                          { Name = "EXTERNAL_ID", "Value.$" = "$.resolve.payload.externalId" },
                          { Name = "REGIONS", "Value.$" = "$.resolve.payload.regionsCsv" },
                          {
                            Name  = "OUTPUT_BUCKET"
                            Value = var.prowler_findings_bucket
                          },
                          {
                            Name      = "OUTPUT_KEY"
                            "Value.$" = "States.Format('tenants/{}/audits/{}/prowler/findings.json', $.resolve.payload.tenantId, $.resolve.payload.auditId)"
                          }
                        ]
                      }
                    ]
                  }
                }
                ResultPath = "$.ecs"
                Next       = "LoadProwlerResults"
                Catch = [{
                  ErrorEquals = ["States.ALL"]
                  ResultPath  = "$.prowlerError"
                  Next        = "LoadProwlerResults"
                }]
              }
              LoadProwlerResults = {
                Type     = "Task"
                Resource = "arn:aws:states:::lambda:invoke"
                Parameters = {
                  FunctionName = var.load_prowler_results_arn
                  Payload = {
                    "tenantId.$"      = "$.resolve.payload.tenantId"
                    "auditId.$"       = "$.resolve.payload.auditId"
                    "accountId.$"     = "$.resolve.payload.accountId"
                    "correlationId.$" = "$.resolve.payload.correlationId"
                  }
                }
                Retry = local.lambda_retry
                Catch = [{
                  ErrorEquals = ["States.ALL"]
                  Next        = "ProwlerFallback"
                }]
                Next = "ProwlerSuccess"
              }
              ProwlerSuccess = {
                Type = "Pass"
                Parameters = {
                  "secops.$" = "$.Payload"
                }
                End = true
              }
              ProwlerFallback = {
                Type = "Pass"
                Result = {
                  secops = {
                    findings = []
                    engine   = "prowler-fargate"
                    warning  = "prowler_branch_failed"
                  }
                }
                End = true
              }
            }
          }
        ]
        ResultPath = "$.engines"
        Next       = "AggregateAudit"
        Catch = [{
          ErrorEquals = ["States.ALL"]
          ResultPath  = "$.error"
          Next        = "MarkAuditFailed"
        }]
      }
      AggregateAudit = {
        Type           = "Task"
        Resource       = "arn:aws:states:::lambda:invoke"
        TimeoutSeconds = 180
        Parameters = {
          FunctionName = var.aggregate_audit_arn
          Payload = {
            "tenantId.$"      = "$.resolve.payload.tenantId"
            "auditId.$"       = "$.resolve.payload.auditId"
            "accountId.$"     = "$.resolve.payload.accountId"
            "correlationId.$" = "$.resolve.payload.correlationId"
            "roleArn.$"       = "$.resolve.payload.roleArn"
            "externalId.$"    = "$.resolve.payload.externalId"
            "regions.$"       = "$.resolve.payload.regions"
            "finops.$"        = "$.engines[0].finops"
            "secops.$"        = "$.engines[1].secops"
          }
        }
        Retry = local.lambda_retry
        End   = true
        Catch = [{
          ErrorEquals = ["States.ALL"]
          ResultPath  = "$.error"
          Next        = "MarkAuditFailed"
        }]
      }
      MarkAuditFailed = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.fail_audit_arn
          Payload = {
            "tenantId.$"  = "$.tenantId"
            "auditId.$"   = "$.auditId"
            "accountId.$" = "$.accountId"
            "error.$"     = "$.error"
          }
        }
        Next = "FailAudit"
      }
      FailAudit = {
        Type  = "Fail"
        Error = "AuditFailed"
        Cause = "Audit pipeline failed — see DynamoDB audit status"
      }
    }
  })
}
