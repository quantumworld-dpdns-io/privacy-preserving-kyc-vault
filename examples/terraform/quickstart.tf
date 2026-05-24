# Terraform to deploy infrastructure for the KYC Vault
#
# A minimal single-region deployment suitable for development/staging.
# For production, see deploy/terraform/ for the full module-based setup.
#
# Usage:
#   terraform init
#   terraform plan -var="environment=staging"
#   terraform apply -var="environment=staging"

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  backend "s3" {
    bucket = "kyc-vault-terraform-state"
    key    = "quickstart/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "kyc-vault"
      ManagedBy   = "terraform"
    }
  }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------
variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------
resource "aws_vpc" "kyc_vault" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${var.environment}-kyc-vault-vpc" }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.kyc_vault.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.environment}-kyc-vault-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.kyc_vault.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Name = "${var.environment}-kyc-vault-private-${count.index}" }
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.kyc_vault.id
  tags   = { Name = "${var.environment}-kyc-vault-igw" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.environment}-kyc-vault-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${var.environment}-kyc-vault-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.kyc_vault.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${var.environment}-kyc-vault-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.kyc_vault.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "${var.environment}-kyc-vault-private-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ---------------------------------------------------------------------------
# RDS PostgreSQL
# ---------------------------------------------------------------------------
resource "aws_db_subnet_group" "kyc_vault" {
  name       = "${var.environment}-kyc-vault-db-subnets"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.environment}-kyc-vault-db-subnets" }
}

resource "aws_security_group" "rds" {
  name        = "${var.environment}-kyc-vault-rds-sg"
  description = "RDS PostgreSQL access"
  vpc_id      = aws_vpc.kyc_vault.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  tags = { Name = "${var.environment}-kyc-vault-rds-sg" }
}

resource "aws_db_instance" "kyc_vault" {
  identifier     = "${var.environment}-kyc-vault-db"
  engine         = "postgres"
  engine_version = "16.3"
  instance_class = var.environment == "production" ? "db.r7g.large" : "db.t4g.medium"

  db_name  = "kycvault"
  username = "kyc_admin"
  password = var.db_password

  allocated_storage     = 100
  max_allocated_storage = 500
  storage_encrypted     = true
  storage_type          = "gp3"

  db_subnet_group_name   = aws_db_subnet_group.kyc_vault.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Sun:04:00-Sun:05:00"
  deletion_protection     = var.environment == "production"
  skip_final_snapshot     = var.environment != "production"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  parameters {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,pgcrypto"
  }
  tags = { Name = "${var.environment}-kyc-vault-db" }
}

# ---------------------------------------------------------------------------
# ElastiCache Redis
# ---------------------------------------------------------------------------
resource "aws_security_group" "redis" {
  name        = "${var.environment}-kyc-vault-redis-sg"
  description = "Redis access"
  vpc_id      = aws_vpc.kyc_vault.id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  tags = { Name = "${var.environment}-kyc-vault-redis-sg" }
}

resource "aws_elasticache_subnet_group" "kyc_vault" {
  name       = "${var.environment}-kyc-vault-redis-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "kyc_vault" {
  cluster_id           = "${var.environment}-kyc-vault-cache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.environment == "production" ? "cache.r7g.large" : "cache.t4g.small"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.kyc_vault.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  tags = { Name = "${var.environment}-kyc-vault-redis" }
}

# ---------------------------------------------------------------------------
# S3 Buckets
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "credentials" {
  bucket = "${var.environment}-kyc-vault-credentials"
}

resource "aws_s3_bucket" "audit_logs" {
  bucket = "${var.environment}-kyc-vault-audit"
}

resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.audit_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "credentials" {
  bucket = aws_s3_bucket.credentials.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit" {
  bucket = aws_s3_bucket.audit_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = toset([
    aws_s3_bucket.credentials.id,
    aws_s3_bucket.audit_logs.id,
  ])
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
output "vpc_id" {
  value = aws_vpc.kyc_vault.id
}

output "db_endpoint" {
  value = aws_db_instance.kyc_vault.endpoint
  sensitive = true
}

output "db_name" {
  value = aws_db_instance.kyc_vault.db_name
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.kyc_vault.cache_nodes[0].address
}

output "credential_bucket" {
  value = aws_s3_bucket.credentials.id
}

output "audit_bucket" {
  value = aws_s3_bucket.audit_logs.id
}
