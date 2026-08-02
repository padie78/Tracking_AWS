data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

# ─────────── VPC mínima (Fargate + IP pública, sin NAT) ───────────

resource "aws_vpc" "prowler" {
  cidr_block           = "10.80.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(var.tags, { Name = "${var.name_prefix}-prowler-vpc" })
}

resource "aws_internet_gateway" "prowler" {
  vpc_id = aws_vpc.prowler.id
  tags   = merge(var.tags, { Name = "${var.name_prefix}-prowler-igw" })
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.prowler.id
  cidr_block              = cidrsubnet(aws_vpc.prowler.cidr_block, 8, count.index + 1)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = merge(var.tags, { Name = "${var.name_prefix}-prowler-public-${count.index}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.prowler.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.prowler.id
  }
  tags = merge(var.tags, { Name = "${var.name_prefix}-prowler-rt" })
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "prowler_tasks" {
  name        = "${var.name_prefix}-prowler-tasks"
  description = "Egress-only for Prowler Fargate tasks"
  vpc_id      = aws_vpc.prowler.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

# ─────────── ECR ───────────

resource "aws_ecr_repository" "prowler" {
  name                 = "${var.name_prefix}-prowler"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "prowler" {
  repository = aws_ecr_repository.prowler.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ─────────── CloudWatch Logs ───────────

resource "aws_cloudwatch_log_group" "prowler" {
  name              = "/ecs/${var.name_prefix}-prowler"
  retention_in_days = 30
  tags              = var.tags
}

# ─────────── IAM — execution (ECR + logs) ───────────

data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-prowler-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ─────────── IAM — task (AssumeRole cliente + S3 findings) ───────────

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-prowler-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "task" {
  statement {
    sid     = "AssumeCustomerScannerRoles"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    resources = [
      "arn:aws:iam::*:role/TrackAwsScannerRole",
      "arn:aws:iam::*:role/TrackAwsScannerRole-*",
    ]
  }

  statement {
    sid     = "WriteProwlerFindings"
    effect  = "Allow"
    actions = ["s3:PutObject", "s3:AbortMultipartUpload"]
    resources = [
      "${var.artifacts_bucket_arn}/tenants/*/audits/*/prowler/*",
      "${var.artifacts_bucket_arn}/tenants/*/audits/*/trivy/*",
    ]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${var.name_prefix}-prowler-task-inline"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

# ─────────── ECS cluster + task definition ───────────

resource "aws_ecs_cluster" "prowler" {
  name = "${var.name_prefix}-prowler"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = var.tags
}

resource "aws_ecs_cluster_capacity_providers" "prowler" {
  cluster_name       = aws_ecs_cluster.prowler.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 0
  }
}

resource "aws_ecs_task_definition" "prowler" {
  family                   = "${var.name_prefix}-prowler"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  tags                     = var.tags

  container_definitions = jsonencode([
    {
      name      = "prowler"
      image     = "${aws_ecr_repository.prowler.repository_url}:${var.prowler_image_tag}"
      essential = true
      environment = [
        { name = "AWS_REGION", value = var.aws_region },
        { name = "OUTPUT_BUCKET", value = var.artifacts_bucket_name },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.prowler.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "prowler"
        }
      }
    }
  ])
}

# ─────────── Trivy (mismo cluster / VPC / roles) ───────────

resource "aws_ecr_repository" "trivy" {
  name                 = "${var.name_prefix}-trivy"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "trivy" {
  repository = aws_ecr_repository.trivy.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "trivy" {
  name              = "/ecs/${var.name_prefix}-trivy"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_ecs_task_definition" "trivy" {
  family                   = "${var.name_prefix}-trivy"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  tags                     = var.tags

  container_definitions = jsonencode([
    {
      name      = "trivy"
      image     = "${aws_ecr_repository.trivy.repository_url}:${var.prowler_image_tag}"
      essential = true
      environment = [
        { name = "AWS_REGION", value = var.aws_region },
        { name = "OUTPUT_BUCKET", value = var.artifacts_bucket_name },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.trivy.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "trivy"
        }
      }
    }
  ])
}
