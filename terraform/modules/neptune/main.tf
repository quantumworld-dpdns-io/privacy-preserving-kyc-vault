# Neptune Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "cluster_identifier" {
  description = "Neptune cluster identifier"
  type        = string
}

variable "engine_version" {
  description = "Neptune engine version"
  type        = string
  default     = "1.2.0.0"
}

variable "instance_class" {
  description = "Instance class for Neptune instances"
  type        = string
  default     = "db.r5.large"
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "vpc_security_group_ids" {
  description = "List of VPC security group IDs"
  type        = list(string)
}

variable "port" {
  description = "Port for the Neptune cluster"
  type        = number
  default     = 8182
}

variable "storage_encrypted" {
  description = "Whether to enable storage encryption"
  type        = bool
  default     = true
}

variable "kms_key_id" {
  description = "KMS key ID for encryption"
  type        = string
  default     = ""
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "preferred_backup_window" {
  description = "Preferred backup window"
  type        = string
  default     = "07:00-09:00"
}

variable "preferred_maintenance_window" {
  description = "Preferred maintenance window"
  type        = string
  default     = "sun:07:00-sun:08:00"
}

variable "tags" {
  description = "Tags to apply to the Neptune cluster"
  type        = map(string)
  default     = {}
}

variable "iam_database_authentication_enabled" {
  description = "Enable IAM database authentication"
  type        = bool
  default     = false
}

variable "storage_type" {
  description = "Storage type (standard or iopt1)"
  type        = string
  default     = "standard"
}

# DB Subnet Group
resource "aws_db_subnet_group" "this" {
  name       = "${var.cluster_identifier}-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.cluster_identifier}-subnet-group"
  })
}

# Neptune Cluster
resource "aws_neptune_cluster" "this" {
  clusterIdentifier      = var.cluster_identifier
  engine                 = "neptune"
  engine_version         = var.engine_version
  database_name          = var.cluster_identifier
  port                   = var.port
  storage_encrypted      = var.storage_encrypted
  kms_key_id             = var.kms_key_id != "" ? var.kms_key_id : null
  backup_retention_period = var.backup_retention_period
  preferred_backup_window = var.preferred_backup_window
  preferred_maintenance_window = var.preferred_maintenance_window
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.vpc_security_group_ids
  iam_database_authentication_enabled = var.iam_database_authentication_enabled
  storage_type           = var.storage_type

  tags = var.tags
}

# Neptune Instance
resource "aws_neptune_instance" "this" {
  count                = 1  # We can make this variable if we want multiple instances
  identifier           = "${var.cluster_identifier}-instance-${count.index}"
  cluster              = aws_neptune_cluster.this.id
  instance_class       = var.instance_class
  publicly_accessible  = false

  tags = merge(var.tags, {
    Name = "${var.cluster_identifier}-instance-${count.index}"
  })
}

output "cluster_endpoint" {
  description = "The cluster endpoint"
  value       = aws_neptune_cluster.this.endpoint
}

output "cluster_port" {
  description = "The cluster port"
  value       = aws_neptune_cluster.this.port
}

output "cluster_arn" {
  description = "The cluster ARN"
  value       = aws_neptune_cluster.this.arn
}

output "cluster_id" {
  description = "The cluster identifier"
  value       = aws_neptune_cluster.this.id
}

output "reader_endpoint" {
  description = "The reader endpoint (for clusters with multiple instances)"
  value       = aws_neptune_cluster.this.reader_endpoint
}
