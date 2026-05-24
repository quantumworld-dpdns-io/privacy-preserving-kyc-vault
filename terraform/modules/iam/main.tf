# IAM Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "role_name" {
  description = "Name of the IAM role"
  type        = string
}

variable "role_description" {
  description = "Description of the IAM role"
  type        = string
  default     = ""
}

variable "assume_role_policy" {
  description = "JSON policy document for assuming the role"
  type        = string
}

variable "attached_policy_arns" {
  description = "List of ARN of IAM policies to attach to the role"
  type        = list(string)
  default     = []
}

variable "inline_policy_names" {
  description = "List of names for inline policies"
  type        = list(string)
  default     = []
}

variable "inline_policies" {
  description = "List of inline policy documents"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to the IAM role"
  type        = map(string)
  default     = {}
}

# IAM Role
resource "aws_iam_role" "this" {
  name                 = var.role_name
  description          = var.role_description
  assume_role_policy   = var.assume_role_policy
  tags                 = var.tags
}

# Attach managed policies
resource "aws_iam_role_policy_attachment" "attached" {
  count       = length(var.attached_policy_arns)
  role        = aws_iam_role.this.name
  policy_arn  = element(var.attached_policy_arns, count.index)
}

# Inline policies
resource "aws_iam_policy" "inline" {
  count   = length(var.inline_policy_names)
  name    = element(var.inline_policy_names, count.index)
  policy  = element(var.inline_policies, count.index)
}

resource "aws_iam_role_policy" "inline" {
  count   = length(var.inline_policy_names)
  role    = aws_iam_role.this.id
  policy  = element(aws_iam_policy.inline[*].id, count.index)
}

output "role_name" {
  description = "Name of the IAM role"
  value       = aws_iam_role.this.name
}

output "role_arn" {
  description = "ARN of the IAM role"
  value       = aws_iam_role.this.arn
}

output "role_unique_id" {
  description = "Unique ID of the IAM role"
  value       = aws_iam_role.this.unique_id
}
