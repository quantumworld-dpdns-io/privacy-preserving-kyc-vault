output "web_acl_arn" {
  description = "ARN of the WAF web ACL"
  value       = aws_wafv2_web_acl.main.arn
}

output "web_acl_id" {
  description = "ID of the WAF web ACL"
  value       = aws_wafv2_web_acl.main.id
}

output "web_acl_name" {
  description = "Name of the WAF web ACL"
  value       = aws_wafv2_web_acl.main.name
}

output "ip_set_arns" {
  description = "Map of IP set ARNs"
  value       = { for k, v in aws_wafv2_ip_set.main : k => v.arn }
}
