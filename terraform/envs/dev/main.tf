terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
  
  backend "s3" {
    bucket = "privacy-preserving-kyc-vault-terraform-state"
    key    = "dev/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = "us-east-1"
}

# Networking Module
module "networking" {
  source = "../../modules/networking"
  
  vpc_cidr             = "10.0.0.0/16"
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.101.0/24", "10.0.102.0/24"]
  availability_zones   = ["us-east-1a", "us-east-1b"]
  
  tags = {
    Environment = "dev"
  }
}

# EKS Module
module "eks" {
  source = "../../modules/eks"
  
  cluster_name      = "privacy-preserving-kyc-vault-dev"
  vpc_id            = module.networking.vpc_id
  subnet_ids        = module.networking.private_subnet_ids
  instance_types    = ["t3.medium"]
  desired_capacity  = 2
  max_size          = 3
  min_size          = 1
  
  tags = {
    Environment = "dev"
  }
}

# RDS Module
module "rds" {
  source = "../../modules/rds"
  
  name                 = "privacy-preserving-kyc-vault-dev-db"
  username             = "admin"
  password             = "dev-password-123"  # In production, use Secrets Manager
  vpc_security_group_ids = [aws_security_group.rds.id]  # We'll create this below
  db_subnet_group_ids  = module.networking.private_subnet_ids
  
  tags = {
    Environment = "dev"
  }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "privacy-preserving-kyc-vault-dev-rds-sg"
  description = "Allow EKS to access RDS"
  vpc_id      = module.networking.vpc_id

  ingress {
    description      = "PostgreSQL from EKS"
    from_port        = 5432
    to_port          = 5432
    protocol         = "tcp"
    security_groups  = [module.eks.cluster_security_group_id]  # Assuming we output this
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = "dev"
  }
}

# ElastiCache Module
module "elasticache" {
  source = "../../modules/elasticache"
  
  cluster_id           = "privacy-preserving-kyc-vault-dev-redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  subnet_group_name    = "dev-elasticache-subnet-group"
  subnet_ids           = module.networking.private_subnet_ids
  security_group_ids   = [aws_security_group.elasticache.id]  # We'll create this below
  
  tags = {
    Environment = "dev"
  }
}

# Security Group for ElastiCache
resource "aws_security_group" "elasticache" {
  name        = "privacy-preserving-kyc-vault-dev-elasticache-sg"
  description = "Allow EKS to access ElastiCache"
  vpc_id      = module.networking.vpc_id

  ingress {
    description      = "Redis from EKS"
    from_port        = 6379
    to_port          = 6379
    protocol         = "tcp"
    security_groups  = [module.eks.cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = "dev"
  }
}

# MSK Module
module "msk" {
  source = "../../modules/msk"
  
  cluster_name         = "privacy-preserving-kyc-vault-dev-msk"
  kafka_version        = "2.8.1"
  number_of_broker_nodes = 3
  instance_type        = "kafka.m5.large"
  client_subnets       = module.networking.private_subnet_ids
  vpc_id               = module.networking.vpc_id
  security_group_ids   = [aws_security_group.msk.id]  # We'll create this below
  
  tags = {
    Environment = "dev"
  }
}

# Security Group for MSK
resource "aws_security_group" "msk" {
  name        = "privacy-preserving-kyc-vault-dev-msk-sg"
  description = "Allow communication within MSK cluster"
  vpc_id      = module.networking.vpc_id

  ingress {
    description      = "MSK broker to broker"
    from_port        = 9092
    to_port          = 9092
    protocol         = "tcp"
    security_groups  = [aws_security_group.msk.id]  # Self-referencing
  }

  ingress {
    description      = "MSK broker to broker TLS"
    from_port        = 9093
    to_port          = 9093
    protocol         = "tcp"
    security_groups  = [aws_security_group.msk.id]  # Self-referencing
  }

  ingress {
    description      = "Zookeeper"
    from_port        = 2181
    to_port          = 2181
    protocol         = "tcp"
    security_groups  = [aws_security_group.msk.id]  # Self-referencing
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = "dev"
  }
}

# S3 Module for data lake
module "s3_datalake" {
  source = "../../modules/s3"
  
  bucket_name        = "privacy-preserving-kyc-vault-dev-datalake"
  acl                = "private"
  versioning_enabled = true
  
  tags = {
    Environment = "dev"
  }
}

# S3 Module for backups
module "s3_backups" {
  source = "../../modules/s3"
  
  bucket_name        = "privacy-preserving-kyc-vault-dev-backups"
  acl                = "private"
  versioning_enabled = true
  
  lifecycle_rules = [{
    id      = "glacier-transition"
    enabled = true
    
    transition {
      days          = 30
      storage_class = "GLACIER"
    }
  }]
  
  tags = {
    Environment = "dev"
  }
}

# ACM Module
module "acm" {
  source = "../../modules/acm"
  
  domain_name               = "dev.privacy-preserving-kyc-vault.example.com"
  subject_alternative_names = ["*.dev.privacy-preserving-kyc-vault.example.com"]
  validation_method         = "DNS"
  
  tags = {
    Environment = "dev"
  }
}

# ECR Module
module "ecr" {
  source = "../../modules/ecr"
  
  repository_name = "privacy-preserving-kyc-vault-dev"
  image_tag_mutability = "MUTABLE"
  scan_on_push = true
  
  tags = {
    Environment = "dev"
  }
}

# IAM Module for EKS service account
module "iam_eks_service_account" {
  source = "../../modules/iam"
  
  role_name = "privacy-preserving-kyc-vault-dev-eks-service-account"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${module.eks.cluster_oidc_issuer_url}"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
      }
    ]
  })
  
  attached_policy_arns = [
    "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
    "arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess"
  ]
  
  tags = {
    Environment = "dev"
  }
}

# WAF Module
module "waf" {
  source = "../../modules/waf"
  
  name        = "privacy-preserving-kyc-vault-dev-waf"
  scope       = "REGIONAL"
  
  tags = {
    Environment = "dev"
  }
}

# CloudFront Module
module "cloudfront" {
  source = "../../modules/cloudfront"
  
  domain_name              = "privacy-preserving-kyc-vault.example.com"
  subdomain                = "dev"
  origin_domain_name       = module.s3_datalake.bucket_website_domain  # If using static site
  viewer_certificate_arn   = module.acm.certificate_arn
  waf_web_acl_arn          = module.waf.web_acl_arn
  
  tags = {
    Environment = "dev"
  }
}

# KMS Module (example)
resource "aws_kms_key" "app_key" {
  description             = "Application encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = {
    Environment = "dev"
  }
}

# Secrets Manager Module (example)
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "privacy-preserving-kyc-vault/dev/db-credentials"
  description = "Database credentials for dev environment"
  
  tags = {
    Environment = "dev"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials_version" {
  secret_id     = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = module.rds.username
    password = module.rds.password
    host     = module.rds.address
    port     = module.rds.port
    dbname   = module.rds.name
  })
}

# SQS Module
resource "aws_sqs_queue" "dead_letter_queue" {
  name                      = "privacy-preserving-kyc-vault-dev-dlq"
  message_retention_seconds = 1209600  # 14 days
  
  tags = {
    Environment = "dev"
  }
}

resource "aws_sqs_queue" "main_queue" {
  name                      = "privacy-preserving-kyc-vault-dev-main"
  message_retention_seconds = 1209600  # 14 days
  redrive_policy            = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter_queue.arn
    maxReceiveCount     = 3
  })
  
  tags = {
    Environment = "dev"
  }
}

# SNS Module
resource "aws_sns_topic" "notifications" {
  name = "privacy-preserving-kyc-vault-dev-notifications"
  
  tags = {
    Environment = "dev"
  }
}

# Data sources
data "aws_caller_identity" "current" {}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "db_address" {
  description = "RDS endpoint address"
  value       = module.rds.address
}

output "redis_endpoint" {
  description = "ElastiCache endpoint"
  value       = module.elasticache.primary_endpoint_address
}

output "msk_bootstrap_brokers" {
  description = "MSK bootstrap brokers"
  value       = module.msk.bootstrap_brokers
}

output "datalake_bucket" {
  description = "S3 data lake bucket name"
  value       = module.s3_datalake.bucket_name
}

output "backups_bucket" {
  description = "S3 backups bucket name"
  value       = module.s3_backups.bucket_name
}

output "certificate_arn" {
  description = "ACM certificate ARN"
  value       = module.acm.certificate_arn
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = module.ecr.repository_url
}

output "waf_web_acl_arn" {
  description = "WAF web ACL ARN"
  value       = module.waf.web_acl_arn
}

output "cloudfront_distribution_domain" {
  description = "CloudFront distribution domain"
  value       = module.cloudfront.distribution_domain_name
}
