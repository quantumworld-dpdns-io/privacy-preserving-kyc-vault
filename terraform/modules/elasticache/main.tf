# ElastiCache Module for Redis
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "cluster_id" {
  description = "Cluster identifier"
  type        = string
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "6.x"
}

variable "node_type" {
  description = "Cache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "subnet_group_name" {
  description = "Subnet group name"
  type        = string
  default     = "elasticache-subnet-group"
}

variable "subnet_ids" {
  description = "List of subnet IDs"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "parameter_group_name" {
  description = "Parameter group name"
  type        = string
  default     = "default.redis6.x"
}

variable "maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "snapshot_retention_limit" {
  description = "Snapshot retention limit in days"
  type        = number
  default     = 0
}

variable "snapshot_window" {
  description = "Snapshot window"
  type        = string
  default     = "05:00-07:00"
}

variable "at_rest_encryption_enabled" {
  description = "Whether to enable at-rest encryption"
  type        = bool
  default     = true
}

variable "transit_encryption_enabled" {
  description = "Whether to enable in-transit encryption"
  type        = bool
  default     = true
}

variable "auth_token" {
  description = "Authentication token for Redis"
  type        = string
  sensitive   = true
  default     = ""
}

# Subnet Group
resource "aws_elasticache_subnet_group" "this" {
  name       = var.subnet_group_name
  subnet_ids = var.subnet_ids

  tags = {
    Name = var.subnet_group_name
  }
}

# Security Group (if not provided)
resource "aws_security_group" "elasticache" {
  count        = length(var.security_group_ids) == 0 ? 1 : 0
  name_prefix  = "${var.cluster_id}-ec"
  description  = "ElastiCache security group"
  vpc_id       = data.aws_vpc.selected.id

  ingress {
    description      = "Redis"
    from_port        = 6379
    to_port          = 6379
    protocol         = "tcp"
    cidr_blocks      = ["10.0.0.0/16"]  # VPC CIDR, adjust as needed
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_id}-ec-sg"
  }
}

# Data source for VPC (if we need to create SG)
data "aws_vpc" "selected" {
  count = length(var.security_group_ids) == 0 ? 1 : 0
  default_tags_enabled = false
  
  filter {
    name   = "tag:Name"
    values = ["*"]
  }
}

# Parameter Group
resource "aws_elasticache_parameter_group" "this" {
  name      = "${var.cluster_id}-pg"
  family    = "redis6.x"
  description = "Parameter group for ${var.cluster_id}"

  parameter {
    name  = "activerehashing"
    value = "yes"
    apply_method = "immediate"
  }
}

# Replication Group (for Redis with clustering)
resource "aws_elasticache_replication_group" "this" {
  replication_group_id          = var.cluster_id
  description                   = "Redis replication group for ${var.cluster_id}"
  engine                        = "redis"
  engine_version                = var.engine_version
  cache_node_type               = var.node_type
  cache_subnet_group_name       = aws_elasticache_subnet_group.this.name
  parameter_group_name          = aws_elasticache_parameter_group.this.name
  number_cache_clusters         = var.num_cache_nodes
  automatic_failover_enabled    = var.num_cache_nodes > 1
  multi_zone_enabled            = var.num_cache_nodes > 1
  security_group_ids            = length(var.security_group_ids) > 0 ? var.security_group_ids : [aws_security_group.elasticache[0].id]
  at_rest_encryption_enabled    = var.at_rest_encryption_enabled
  transit_encryption_enabled    = var.transit_encryption_enabled
  auth_token                    = var.auth_token != "" ? var.auth_token : null
  maintenance_window            = var.maintenance_window
  snapshot_retention_limit      = var.snapshot_retention_limit
  snapshot_window               = var.snapshot_window
  snapshot_name                 = "${var.cluster_id}-snapshot"

  tags = {
    Name = var.cluster_id
  }
}

# For single node (non-clustered) Redis
resource "aws_elasticache_cluster" "this" {
  count             = var.num_cache_nodes == 1 && length(var.security_group_ids) > 0 ? 1 : 0
  engine            = "redis"
  engine_version    = var.engine_version
  cache_node_type   = var.node_type
  cache_cluster_id  = "${var.cluster_id}-cluster"
  cache_subnet_group_name = aws_elasticache_subnet_group.this.name
  parameter_group_name  = aws_elasticache_parameter_group.this.name
  num_cache_nodes   = 1
  security_group_ids = length(var.security_group_ids) > 0 ? var.security_group_ids : [aws_security_group.elasticache[0].id]
  at_rest_encryption_enabled    = var.at_rest_encryption_enabled
  transit_encryption_enabled    = var.transit_encryption_enabled
  auth_token                    = var.auth_token != "" ? var.auth_token : null
  maintenance_window            = var.maintenance_window
  snapshot_retention_limit      = var.snapshot_retention_limit
  snapshot_window               = var.snapshot_window
  snapshot_name                 = "${var.cluster_id}-snapshot"

  tags = {
    Name = "${var.cluster_id}-cluster"
  }
}

output "primary_endpoint_address" {
  description = "The primary endpoint address"
  value       = length(var.security_group_ids) > 0 && var.num_cache_nodes == 1 ? aws_elasticache_cluster.this[0].configuration_endpoint_address : aws_elasticache_replication_group.this.primary_endpoint_address
}

output "primary_endpoint_port" {
  description = "The primary endpoint port"
  value       = length(var.security_group_ids) > 0 && var.num_cache_nodes == 1 ? aws_elasticache_cluster.this[0].configuration_endpoint_port : aws_elasticache_replication_group.this.primary_endpoint_port
}

output "configuration_endpoint_address" {
  description = "The configuration endpoint address"
  value       = aws_elasticache_replication_group.this.configuration_endpoint_address
}

output "configuration_endpoint_port" {
  description = "The configuration endpoint port"
  value       = aws_elasticache_replication_group.this.configuration_endpoint_port
}

output "member_clusters" {
  description = "List of cache cluster IDs"
  value       = length(var.security_group_ids) > 0 && var.num_cache_nodes == 1 ? [aws_elasticache_cluster.this[0].id] : aws_elasticache_replication_group.this.member_clusters
}
