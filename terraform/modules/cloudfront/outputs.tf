output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.arn
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_hosted_zone_id" {
  description = "CloudFront distribution hosted zone ID"
  value       = aws_cloudfront_distribution.main.hosted_zone_id
}

output "origin_access_identity_arn" {
  description = "ARN of the CloudFront origin access identity"
  value       = aws_cloudfront_origin_access_identity.main.arn
}

output "origin_access_identity_path" {
  description = "Path of the CloudFront origin access identity"
  value       = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
}
