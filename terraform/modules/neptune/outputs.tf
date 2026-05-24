output "cluster_id" {
  description = "Neptune cluster ID"
  value       = aws_neptune_cluster.main.id
}

output "cluster_arn" {
  description = "ARN of the Neptune cluster"
  value       = aws_neptune_cluster.main.arn
}

output "cluster_endpoint" {
  description = "Neptune cluster endpoint (writer)"
  value       = aws_neptune_cluster.main.endpoint
}

output "cluster_reader_endpoint" {
  description = "Neptune cluster reader endpoint"
  value       = aws_neptune_cluster.main.reader_endpoint
}

output "cluster_port" {
  description = "Neptune cluster port"
  value       = aws_neptune_cluster.main.port
}

output "security_group_id" {
  description = "Neptune security group ID"
  value       = aws_security_group.neptune.id
}

output "instance_ids" {
  description = "List of Neptune instance IDs"
  value       = aws_neptune_cluster_instance.main[*].id
}
