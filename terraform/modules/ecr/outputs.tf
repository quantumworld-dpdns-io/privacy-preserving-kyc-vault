output "repository_names" {
  description = "Map of repository names"
  value       = { for k, v in aws_ecr_repository.main : k => v.name }
}

output "repository_urls" {
  description = "Map of repository URLs"
  value       = { for k, v in aws_ecr_repository.main : k => v.repository_url }
}

output "repository_arns" {
  description = "Map of repository ARNs"
  value       = { for k, v in aws_ecr_repository.main : k => v.arn }
}
