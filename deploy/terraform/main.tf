# Terraform Main Module - KYC Vault Cloud Infrastructure
# ============================================================
# Provisions: VPC, EKS, RDS (PostgreSQL), ElastiCache (Redis),
# MSK (Kafka), S3, ACM, Route53, WAF

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# ============================================================
# Provider Configuration
# ============================================================
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "kyc-vault"
      ManagedBy   = "terraform"
      Owner       = "platform-team"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# ============================================================
# VPC
# ============================================================
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.environment}-kyc-vault-vpc"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs
  intra_subnets   = var.intra_subnet_cidrs

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "production"
  one_nat_gateway_per_az = var.environment == "production"
  enable_vpn_gateway     = false

  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }

  tags = {
    Name = "${var.environment}-kyc-vault-vpc"
  }
}

# ============================================================
# EKS Cluster
# ============================================================
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "${var.environment}-kyc-vault-cluster"
  cluster_version = "1.30"

  cluster_endpoint_public_access = var.environment != "production"
  cluster_endpoint_private_access = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
    aws-ebs-csi-driver = { most_recent = true }
  }

  eks_managed_node_groups = {
    kyc-services = {
      desired_size = var.service_node_desired
      min_size     = var.service_node_min
      max_size     = var.service_node_max

      instance_types = var.service_instance_types
      capacity_type  = "ON_DEMAND"

      labels = {
        "node-group" = "kyc-services"
      }
      tags = {
        "k8s.io/cluster-autoscaler/enabled" = "true"
      }
    }

    kyc-ai-inference = {
      desired_size = var.ai_node_desired
      min_size     = var.ai_node_min
      max_size     = var.ai_node_max

      instance_types = var.ai_instance_types
      capacity_type  = var.environment == "production" ? "ON_DEMAND" : "SPOT"

      labels = {
        "node-group" = "kyc-ai-inference"
        "gpu"        = "true"
      }
      taints = {
        gpu = {
          key    = "gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }
    }
  }

  node_security_group_additional_rules = {
    allow_https = {
      description = "Allow HTTPS from VPC"
      protocol    = "tcp"
      from_port   = 443
      to_port     = 443
      type        = "ingress"
      cidr_blocks = [module.vpc.vpc_cidr_block]
    }
  }
}

# ============================================================
# RDS PostgreSQL
# ============================================================
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "${var.environment}-kyc-vault-db"

  engine               = "postgres"
  engine_version       = "16.3"
  family               = "postgres16"
  major_engine_version = "16"
  instance_class       = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_encrypted     = true
  storage_type          = "gp3"

  db_name  = "kycvault"
  username = "kyc_admin"
  password = random_password.db_password.result
  port     = 5432

  multi_az               = var.environment == "production"
  db_subnet_group_name   = module.vpc.database_subnet_group
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = var.environment == "production" ? 30 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Sun:04:00-Sun:05:00"
  deletion_protection     = var.environment == "production"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  parameters = [
    { name = "log_statement", value = "ddl" },
    { name = "log_min_duration_statement", value = "1000" },
    { name = "shared_preload_libraries", value = "pg_stat_statements,pgcrypto" },
    { name = "pg_stat_statements.track", value = "all" },
  ]
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# ============================================================
# ElastiCache Redis
# ============================================================
module "redis" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "~> 1.0"

  replication_group_id = "${var.environment}-kyc-vault-cache"
  description          = "KYC Vault Redis cache cluster"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type

  parameter_group_family = "redis7"
  port                   = 6379

  num_cache_clusters = var.environment == "production" ? 3 : 2

  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                  = random_password.redis_auth.result
  automatic_failover_enabled  = var.environment == "production"

  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.redis.id]

  maintenance_window = "sun:05:00-sun:06:00"
  snapshot_window    = "04:00-05:00"
  snapshot_retention_limit = var.environment == "production" ? 7 : 1

  parameters = [
    { name = "maxmemory-policy", value = "allkeys-lru" },
    { name = "timeout", value = "300" },
    { name = "notify-keyspace-events", value = "Ex" },
  ]

  cloudwatch_logs_exports = {
    slow_log = var.environment == "production"
    engine_log = var.environment == "production"
  }
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

# ============================================================
# MSK Kafka
# ============================================================
module "msk" {
  source  = "terraform-aws-modules/msk-kafka-cluster/aws"
  version = "~> 2.0"

  cluster_name = "${var.environment}-kyc-vault-kafka"

  kafka_version = "3.7.0"
  number_of_broker_nodes = var.kafka_broker_count

  broker_node_client_subnets  = module.vpc.private_subnets
  broker_node_security_groups = [aws_security_group.kafka.id]

  broker_node_storage_info = {
    volume_size = var.kafka_volume_size
    volume_type = "gp3"
  }

  instance_type = var.kafka_instance_type

  encryption_info = {
    encryption_in_transit_client_broker = "TLS"
    encryption_in_transit_in_cluster    = true
  }

  client_authentication = {
    unauthenticated = false
    sasl = {
      iam = true
    }
  }

  enhanced_monitoring = "PER_TOPIC_PER_PARTITION"
  logging_info = {
    broker_logs = {
      cloudwatch_logs = {
        enabled = var.environment == "production"
      }
    }
  }

  tags = {
    Name = "${var.environment}-kyc-vault-kafka"
  }
}

# ============================================================
# S3 Buckets
# ============================================================
resource "aws_s3_bucket" "credential_artifacts" {
  bucket = "${var.environment}-kyc-vault-credentials-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "iceberg_data_lake" {
  bucket = "${var.environment}-kyc-vault-iceberg-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "audit_logs" {
  bucket = "${var.environment}-kyc-vault-audit-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.audit_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "all" {
  for_each = {
    creds = aws_s3_bucket.credential_artifacts.id
    iceberg = aws_s3_bucket.iceberg_data_lake.id
    audit   = aws_s3_bucket.audit_logs.id
  }
  bucket = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = {
    creds   = aws_s3_bucket.credential_artifacts.id
    iceberg = aws_s3_bucket.iceberg_data_lake.id
    audit   = aws_s3_bucket.audit_logs.id
  }
  bucket = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_caller_identity" "current" {}

# ============================================================
# Security Groups
# ============================================================
resource "aws_security_group" "rds" {
  name        = "${var.environment}-kyc-vault-rds-sg"
  description = "RDS PostgreSQL security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.environment}-kyc-vault-redis-sg"
  description = "ElastiCache Redis security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
}

resource "aws_security_group" "kafka" {
  name        = "${var.environment}-kyc-vault-kafka-sg"
  description = "MSK Kafka security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 9092
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
}

# ============================================================
# ACM Certificate
# ============================================================
resource "aws_acm_certificate" "kyc_vault" {
  domain_name       = "*.${var.domain_name}"
  validation_method = "DNS"

  subject_alternative_names = [var.domain_name]

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================
# WAF
# ============================================================
resource "aws_wafv2_web_acl" "kyc_vault" {
  count = var.environment == "production" ? 1 : 0

  name        = "${var.environment}-kyc-vault-waf"
  description = "WAF for KYC Vault API"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 0
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSCommonRules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesSQLiRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSSQLiRules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimit"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 10000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "kyc-vault-waf"
    sampled_requests_enabled   = true
  }
}

# ============================================================
# Route53
# ============================================================
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.eks.cluster_oidc_issuer_url
    zone_id                = module.vpc.vpc_id
    evaluate_target_health = true
  }
}

# ============================================================
# IAM Roles for Service Accounts (IRSA)
# ============================================================
module "irsa" {
  for_each = toset(var.irsa_services)
  source   = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"

  role_name = "${var.environment}-kyc-vault-${each.key}"

  oidc_providers = {
    eks = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kyc-vault:${each.key}"]
    }
  }

  role_policy_arns = {
    s3    = aws_s3_bucket.credential_artifacts.arn
    kms   = "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/*"
  }
}
