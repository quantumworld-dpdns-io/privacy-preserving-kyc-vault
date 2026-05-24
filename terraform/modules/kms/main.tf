# KMS Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "key_description" {
  description = "Description of the KMS key"
  type        = string
  default     = "Application encryption key"
}

variable "deletion_window_in_days" {
  description = "Deletion window in days"
  type        = number
  default     = 30
}

variable "enable_key_rotation" {
  description = "Enable automatic key rotation"
  type        = bool
  default     = true
}

variable "key_usage" {
  description = "Key usage (ENCRYPT_DECRYPT or SIGN_VERIFY)"
  type        = string
  default     = "ENCRYPT_DECRYPT"
}

variable "key_spec" {
  description = "Key spec (SYMMETRIC_DEFAULT, RSA_2048, etc.)"
  type        = string
  default     = "SYMMETRIC_DEFAULT"
}

variable "tags" {
  description = "Tags to apply to the KMS key"
  type        = map(string)
  default     = {}
}

variable "policy" {
  description = "JSON policy document for the KMS key"
  type        = string
  default     = ""
}

# KMS Key
resource "aws_kms_key" "this" {
  description         = var.key_description
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation = var.enable_key_rotation
  key_usage           = var.key_usage
  key_spec            = var.key_spec
  
  policy = var.policy != "" ? var.policy : jsonencode({
    Version = "2012-10-17"
    Id      = "key-default-1"
    Statement = [
      {
        Sid       = "Enable IAM User Permissions"
        Effect    = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action  = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = var.tags
}

# Data source for current account
data "aws_caller_identity" "current" {}

output "key_id" {
  description = "The Key ID of the KMS key"
  value       = aws_kms_key.this.key_id
}

output "key_arn" {
  description = "The ARN of the KMS key"
  value       = aws_kms_key.this.arn
}
