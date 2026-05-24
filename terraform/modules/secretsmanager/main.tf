# Secrets Manager Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "name" {
  description = "Name of the secret"
  type        = string
}

variable "description" {
  description = "Description of the secret"
  type        = string
  default     = ""
}

variable "kms_key_id" {
  description = "KMS key ID for encryption"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to the secret"
  type        = map(string)
  default     = {}
}

variable "rotation_lambda_arn" {
  description = "ARN of Lambda function for rotation"
  type        = string
  default     = ""
}

variable "rotation_rules" {
  description = "Rotation rules"
  type        = any
  default     = null
}

variable "replica_regions" {
  description = "List of regions for replication"
  type        = list(string)
  default     = []
}

# Secrets Manager Secret
resource "aws_secretsmanager_secret" "this" {
  name        = var.name
  description = var.description
  kms_key_id  = var.kms_key_id != "" ? var.kms_key_id : null
  tags        = var.tags

  rotation_lambda_arn = var.rotation_lambda_arn != "" ? var.rotation_lambda_arn : null
  rotation_rules      = var.rotation_rules != null ? var.rotation_rules : null

  replica {
    region = element(var.replica_regions, 0)
  }
}

# Secret Version (initial version)
resource "aws_secretsmanager_secret_version" "this" {
  secret_id     = aws_secretsmanager_secret.this.id
  secret_string = var.secret_string
}

output "secret_arn" {
  description = "ARN of the secret"
  value       = aws_secretsmanager_secret.this.arn
}

output "secret_name" {
  description = "Name of the secret"
  value       = aws_secretsmanager_secret.this.name
}
