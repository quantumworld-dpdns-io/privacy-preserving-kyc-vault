# SNS Module
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
  description = "Name of the SNS topic"
  type        = string
}

variable "tags" {
  description = "Tags to apply to the SNS topic"
  type        = map(string)
  default     = {}
}

# SNS Topic
resource "aws_sns_topic" "this" {
  name = var.name
  tags = var.tags
}

# Optional: SMS preferences for the topic (if needed)
# resource "aws_sns_topic_policy" "this" {
#   arn    = aws_sns_topic.this.arn
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Effect = "Allow"
#         Principal = {
#           AWS = "*"
#         }
#         Action = "SNS:Publish"
#         Resource = aws_sns_topic.this.arn
#         Condition = {
#           StringEquals = {
#             "AWS:SourceOwner" = data.aws_caller_identity.current.account_id
#           }
#         }
#       }
#     ]
#   })
# }

output "topic_arn" {
  description = "ARN of the SNS topic"
  value       = aws_sns_topic.this.arn
}

output "topic_name" {
  description = "Name of the SNS topic"
  value       = aws_sns_topic.this.name
}
