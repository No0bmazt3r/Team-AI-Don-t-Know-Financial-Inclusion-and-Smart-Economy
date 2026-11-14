# Coinvoy on AWS, one root module. Setup and first run: README → Deployment.
#
#   rider ──HTTPS──▶ CloudFront ─┬─ /api/*, /o/* ─▶ ECS Express Mode (API + engine, one container) ─▶ RDS Postgres
#                                └─ everything else ─▶ private S3 bucket (the PWA)
#
# No secret value is ever in Terraform state: coinvoy/api's values are set with the CLI, and the database password is
# generated ephemerally and written only through write-only arguments (password_wo, secret_string_wo).

terraform {
  required_version = ">= 1.11" # S3 native locking (1.10) and write-only arguments (1.11)
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.23" } # 6.23 added aws_ecs_express_gateway_service
    random = { source = "hashicorp/random", version = "~> 3.7" }
  }
  # bucket comes from -backend-config (it holds the account ID): see scripts/bootstrap-state.sh
  backend "s3" {
    key          = "coinvoy/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags { tags = { app = "coinvoy" } }
}

# GitHub's OIDC subject now carries immutable IDs: repo:<owner>@<owner-id>/<repo>@<repo-id>:<context>.
# Trusting the IDs (names wildcarded) survives renames and can't be matched by a look-alike repo.
# Find them: curl -s https://api.github.com/repos/<owner>/<repo> → owner.id and id
variable "github_owner_id" {
  description = "Numeric ID of the GitHub account that owns the repository"
  type        = string
  default     = "116445942"
}

variable "github_repo_id" {
  description = "Numeric ID of the repository whose workflows may assume the GitHub roles"
  type        = string
  default     = "1413429273"
}

variable "alert_email" {
  description = "Where budget and health alerts go. Empty = no alerts. CI passes it from the ALERT_EMAIL variable."
  type        = string
  default     = ""
}

variable "secret_keys" {
  description = "Keys of the coinvoy/api JSON secret passed to the container. Every key listed here must exist in the secret, or the task won't start."
  type        = list(string)
}

variable "app_url" {
  description = "The app's public address. CloudFront's address isn't known until the first apply creates it (and CloudFront needs the API first), so: first apply with the default, then set it from the app_url output and apply again."
  type        = string
  default     = "https://pending.invalid"
}

variable "app_env" {
  description = "Plain (non-secret) environment for the API. Deployment-fixed values below override these."
  type        = map(string)
  default     = {}
}

data "aws_caller_identity" "me" {}

locals {
  account = data.aws_caller_identity.me.account_id
  name    = "coinvoy"
}

# ---------------------------------------------------------------- GitHub Actions → AWS (OIDC, no stored keys)

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# Which GitHub jobs may assume each role, by the token's subject claim
locals {
  github_roles = {
    plan   = "repo:*@${var.github_owner_id}/*@${var.github_repo_id}:pull_request"           # infra.yml on a pull request
    apply  = "repo:*@${var.github_owner_id}/*@${var.github_repo_id}:environment:infra"      # infra.yml apply (GitHub environment "infra", main only)
    deploy = "repo:*@${var.github_owner_id}/*@${var.github_repo_id}:environment:production" # deploy-*.yml (GitHub environment "production", main only)
  }
}

data "aws_iam_policy_document" "github_trust" {
  for_each = local.github_roles
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike" # names are wildcards; the IDs must match exactly
      variable = "token.actions.githubusercontent.com:sub"
      values   = [each.value]
    }
  }
}

resource "aws_iam_role" "github" {
  for_each           = local.github_roles
  name               = "${local.name}-github-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.github_trust[each.key].json
}

# ponytail: plan is read-only but can read the state bucket, and any pull request from inside the repo can use it.
# Fine while the state holds no database or API keys; give plan its own approved environment if that changes.
resource "aws_iam_role_policy_attachment" "plan" {
  role       = aws_iam_role.github["plan"].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy_attachment" "apply" {
  role       = aws_iam_role.github["apply"].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload", "ecr:DescribeImages",
      "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.api.arn]
  }
  statement {
    # UpdateExpressGatewayService registers a new task definition revision as the caller (IAM service reference)
    actions = [
      "ecs:DescribeExpressGatewayService", "ecs:UpdateExpressGatewayService", "ecs:RegisterTaskDefinition",
      "ecs:DescribeServices", "ecs:DescribeServiceDeployments", "ecs:ListServiceDeployments",
      "ecs:ListTasks", "ecs:DescribeTasks", # deploy-backend.yml prints why a task stopped when a deploy fails
    ]
    resources = ["*"] # ponytail: Express Mode's resource-level IAM is new; scope to the service ARN once it's documented
  }
  statement {
    actions   = ["logs:FilterLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.execution.arn, aws_iam_role.infrastructure.arn]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.web.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  role   = aws_iam_role.github["deploy"].name
  policy = data.aws_iam_policy_document.deploy.json
}

# ---------------------------------------------------------------- Backend: image, secret, logs, ECS Express Mode

resource "aws_ecr_repository" "api" {
  name                 = "${local.name}-api"
  image_tag_mutability = "IMMUTABLE" # one tag per commit, never overwritten
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images (rollback room)"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# Values: README → Deployment → "Set the secret values"
resource "aws_secretsmanager_secret" "api" {
  name = "${local.name}/api"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}-api"
  retention_in_days = 14
}

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by ECS to pull the image, write logs and read the secret (not by the app itself)
resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secret" {
  role = aws_iam_role.execution.name
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = [aws_secretsmanager_secret.api.arn, aws_secretsmanager_secret.db.arn] }]
  })
}

# Lets ECS create and manage the load balancer, certificate, security groups and scaling for Express Mode
resource "aws_iam_role" "infrastructure" {
  name = "${local.name}-ecs-infrastructure"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "ecs.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "infrastructure" {
  role       = aws_iam_role.infrastructure.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices"
}

resource "aws_ecs_cluster" "main" {
  name = local.name
}

# CloudFront sends this header on every request it forwards; the API refuses /api and /o without it, so the
# Express Mode address can't be used to skip CloudFront. It sits in state either way (CloudFront needs it in plain).
resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

locals {
  # Fixed by this deployment; app_env can't override them
  deploy_env = {
    APP_URL          = var.app_url
    COOKIE_SECURE    = "true"
    DATABASE_URL     = "postgres://${aws_db_instance.main.username}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}" # password: PGPASSWORD below
    MIGRATE_ON_START = "true"                                                                                                         # one task, so migrations at start never race; a failing one fails the deploy, ECS keeps the old task
    TRUST_PROXY      = "2"                                                                                                            # CloudFront, then the load balancer
    PGLITE_PORT      = "0"
    ORIGIN_VERIFY    = random_password.origin_verify.result
  }
}

resource "aws_ecs_express_gateway_service" "api" {
  service_name            = "${local.name}-api"
  cluster                 = aws_ecs_cluster.main.name
  execution_role_arn      = aws_iam_role.execution.arn
  infrastructure_role_arn = aws_iam_role.infrastructure.arn
  cpu                     = "512"
  memory                  = "1024" # measured ~320 MB peak (backend/Dockerfile); headroom for the engine's PDF work
  health_check_path       = "/api/health"
  wait_for_steady_state   = true

  # ponytail: exactly one task, because payday reminders run on a timer inside the API (services/reminders.ts).
  # Two tasks would send every reminder twice. Move reminders to an EventBridge schedule before raising max.
  scaling_target = [{
    min_task_count            = 1
    max_task_count            = 1
    auto_scaling_metric       = "AVERAGE_CPU"
    auto_scaling_target_value = 70
  }]

  primary_container {
    # The deploy workflow changes the image; Terraform keeps whatever is running (see lifecycle below).
    # Very first apply: README → Deployment pushes an image tagged "initial" before this is created.
    image          = "${aws_ecr_repository.api.repository_url}:initial"
    container_port = 8000

    aws_logs_configuration = [{
      log_group         = aws_cloudwatch_log_group.api.name
      log_stream_prefix = "api"
    }]

    dynamic "environment" {
      for_each = merge(var.app_env, local.deploy_env)
      content {
        name  = environment.key
        value = environment.value
      }
    }

    dynamic "secret" {
      for_each = toset(var.secret_keys)
      content {
        name       = secret.value
        value_from = "${aws_secretsmanager_secret.api.arn}:${secret.value}::"
      }
    }

    # node-postgres reads PGPASSWORD when DATABASE_URL has no password
    secret {
      name       = "PGPASSWORD"
      value_from = aws_secretsmanager_secret.db.arn
    }
  }

  lifecycle {
    ignore_changes = [primary_container[0].image]
  }
}

locals {
  # The service's public HTTPS address, without the scheme: CloudFront wants a bare hostname
  api_host = regex("^(?:https?://)?([^/]+)", aws_ecs_express_gateway_service.api.ingress_paths[0].endpoint)[0]
}

# ---------------------------------------------------------------- Database: RDS Postgres, private, in the default VPC

variable "db_password_version" {
  description = "Raise by one to generate and set a new database password (then run Deploy backend so the task reads it)"
  type        = number
  default     = 1
}

data "aws_vpc" "default" { default = true }

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = data.aws_subnets.default.ids
}

# ponytail: anything inside the default VPC may open a connection (password and TLS still required). Tighten to the
# backend's own security group if other workloads ever share this VPC (needs network_configuration on the service).
resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "Postgres from inside the VPC only"
  vpc_id      = data.aws_vpc.default.id
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }
}

# Generated during the apply and never stored: it reaches RDS and the secret only through write-only arguments
ephemeral "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db" {
  name = "${local.name}/db"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id                = aws_secretsmanager_secret.db.id
  secret_string_wo         = ephemeral.random_password.db.result
  secret_string_wo_version = var.db_password_version
}

resource "aws_db_instance" "main" {
  identifier            = local.name
  engine                = "postgres"
  engine_version        = "17"
  instance_class        = "db.t4g.micro"
  allocated_storage     = 20
  max_allocated_storage = 50 # grows by itself, never past this
  storage_type          = "gp3"
  storage_encrypted     = true
  db_name               = "coinvoy"
  username              = "coinvoy"
  # Not RDS-managed rotation: the task reads PGPASSWORD once at start, so a 7-day rotation would lock it out
  password_wo                = ephemeral.random_password.db.result
  password_wo_version        = var.db_password_version
  db_subnet_group_name       = aws_db_subnet_group.main.name
  vpc_security_group_ids     = [aws_security_group.db.id]
  publicly_accessible        = false
  multi_az                   = false
  backup_retention_period    = 7
  backup_window              = "18:00-18:30"         # 02:00 in Malaysia
  maintenance_window         = "sat:19:00-sat:20:00" # Sunday 03:00 in Malaysia
  auto_minor_version_upgrade = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name}-final"
  copy_tags_to_snapshot      = true
}

# ---------------------------------------------------------------- Frontend: private S3 bucket behind CloudFront

resource "aws_s3_bucket" "web" {
  bucket = "${local.name}-web-${local.account}"
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.web.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.web.arn } }
    }]
  })
}

# Deep links (/weeks/3) have no file in the bucket: serve index.html and let the app route.
# Only on the S3 behaviour, so the API's real 404s stay 404s.
resource "aws_cloudfront_function" "spa" {
  name    = "${local.name}-spa"
  runtime = "cloudfront-js-2.0"
  code    = <<-JS
    function handler(event) {
      var r = event.request;
      if (r.uri.split('/').pop().indexOf('.') === -1) r.uri = '/index.html';
      return r;
    }
  JS
}

# Same headers vercel.json set (the API sets its own on /api responses)
resource "aws_cloudfront_response_headers_policy" "web" {
  name = "${local.name}-web"
  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data: blob: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; script-src 'self' https://accounts.google.com/gsi/client; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      override                = true
    }
    content_type_options { override = true }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
  }
}

data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }
# Cookies, query strings and headers through, but not Host: the Express Mode load balancer routes on its own hostname
data "aws_cloudfront_origin_request_policy" "api" { name = "Managed-AllViewerExceptHostHeader" }

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  comment             = local.name
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # includes Asia edges; _100 is NA/EU only
  http_version        = "http2and3"

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = "api"
    domain_name = local.api_host
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60 # Snap's LLM calls can take a while
    }
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # Cache-Control comes from the upload (deploy-frontend.yml): assets immutable, everything else no-cache
  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.web.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = ["/api/*", "/o/*"]
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "api"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      compress                 = true
      cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.api.id
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  # ponytail: *.cloudfront.net for now. Own domain: an ACM cert in us-east-1, aliases here, and a DNS record.
  viewer_certificate { cloudfront_default_certificate = true }
}

# ---------------------------------------------------------------- Alerts: monthly budget and "no healthy task"

resource "aws_budgets_budget" "monthly" {
  count        = var.alert_email == "" ? 0 : 1
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = "100" # estimate ~$80/month (infra/README.md → Cost); 80% forecast warns early
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}

resource "aws_sns_topic" "alerts" {
  count = var.alert_email == "" ? 0 : 1
  name  = "${local.name}-alerts"
}

# AWS emails a confirmation link first; alerts arrive only after it's clicked
resource "aws_sns_topic_subscription" "alerts" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# A running task reports CPU every minute; no data for 5 minutes means no task is running.
# ponytail: proxy for "0 healthy tasks" without Container Insights; switch to RunningTaskCount if that gets enabled.
resource "aws_cloudwatch_metric_alarm" "api_down" {
  count               = var.alert_email == "" ? 0 : 1
  alarm_name          = "${local.name}-api-no-running-task"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  dimensions          = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_express_gateway_service.api.service_name }
  statistic           = "SampleCount"
  period              = 60
  evaluation_periods  = 5
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]
  ok_actions          = [aws_sns_topic.alerts[0].arn]
}

# ---------------------------------------------------------------- What the workflows need (repository variables)

output "app_url" { value = "https://${aws_cloudfront_distribution.web.domain_name}" }
output "api_origin" { value = local.api_host }

output "github_variables" {
  description = "Run these once (gh CLI) so the workflows can find everything"
  value       = <<-SH
    gh variable set AWS_ACCOUNT_ID --body ${local.account}
    gh variable set ECS_SERVICE_ARN --body ${aws_ecs_express_gateway_service.api.service_arn}
    gh variable set CLOUDFRONT_DISTRIBUTION_ID --body ${aws_cloudfront_distribution.web.id}
  SH
}
