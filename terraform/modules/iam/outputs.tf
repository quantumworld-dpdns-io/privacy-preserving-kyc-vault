output "role_arns" {
  description = "Map of custom IAM role ARNs"
  value       = { for k, v in aws_iam_role.custom : k => v.arn }
}

output "role_names" {
  description = "Map of custom IAM role names"
  value       = { for k, v in aws_iam_role.custom : k => v.name }
}

output "irsa_role_arns" {
  description = "Map of IRSA role ARNs"
  value       = { for k, v in aws_iam_role.irsa : k => v.arn }
}

output "irsa_role_names" {
  description = "Map of IRSA role names"
  value       = { for k, v in aws_iam_role.irsa : k => v.name }
}
