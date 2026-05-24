output "key_arns" {
  description = "Map of KMS key ARNs"
  value       = { for k, v in aws_kms_key.main : k => v.arn }
}

output "key_ids" {
  description = "Map of KMS key IDs"
  value       = { for k, v in aws_kms_key.main : k => v.key_id }
}

output "alias_names" {
  description = "Map of KMS alias names"
  value       = { for k, v in aws_kms_alias.main : k => v.name }
}
