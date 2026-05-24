output "bucket_ids" {
  description = "Map of bucket IDs"
  value       = { for k, v in aws_s3_bucket.main : k => v.id }
}

output "bucket_arns" {
  description = "Map of bucket ARNs"
  value       = { for k, v in aws_s3_bucket.main : k => v.arn }
}

output "bucket_domain_names" {
  description = "Map of bucket domain names"
  value       = { for k, v in aws_s3_bucket.main : k => v.bucket_domain_name }
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for S3 encryption"
  value       = var.create_kms_key ? aws_kms_key.s3[0].arn : null
}
