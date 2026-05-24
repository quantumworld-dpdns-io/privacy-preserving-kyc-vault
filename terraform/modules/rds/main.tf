# RDS Module for PostgreSQL
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "db_subnet_group_name" {
  description = "Name of the DB subnet group"
  type        = string
  default     = "db-subnet-group"
}

variable "db_instance_class" {
  description = "DB instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "13.7"
}

variable "name" {
  description = "DB instance identifier"
  type        = string
}

variable "username" {
  description = "Database username"
  type        = string
}

variable "password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "vpc_security_group_ids" {
  description = "List of VPC security group IDs"
  type        = list(string)
}

variable "db_subnet_group_ids" {
  description = "List of subnet IDs for DB subnet group"
  type        = list(string)
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Backup window"
  type        = string
  default     = "03:00-05:00"
}

variable "maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "multi_az" {
  description = "Whether to enable multi-AZ"
  type        = bool
  default     = false
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

# DB Subnet Group
resource "aws_db_subnet_group" "this" {
  name       = var.db_subnet_group_name
  subnet_ids = var.db_subnet_group_ids

  tags = {
    Name = var.db_subnet_group_name
  }
}

# RDS Instance
resource "aws_db_instance" "this" {
  identifier              = var.name
  engine                  = "postgres"
  engine_version          = var.engine_version
  instance_class          = var.db_instance_class
  allocated_storage       = var.allocated_storage
  name                    = var.name
  username                = var.username
  password                = var.password
  parameter_group_name    = "default.postgres13"
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.name}-final-snapshot"
  vpc_security_group_ids  = var.vpc_security_group_ids
  db_subnet_group_name    = aws_db_subnet_group.this.name
  multi_az                = var.multi_az
  storage_encrypted       = var.storage_encrypted
  kms_key_id              = var.kms_key_id != "" ? var.kms_key_id : null
  backup_retention_period = var.backup_retention_period
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window
  publicly_accessible     = false

  tags = {
    Name = var.name
  }
}

output "address" {
  description = "The DNS address of the RDS instance"
  value       = aws_db_instance.this.address
}

output "port" {
  description = "The port on which the DB accepts connections"
  value       = aws_db_instance.this.port
}

output "instance_id" {
  description = "The RDS instance ID"
  value       = aws_db_instance.this.id
}
