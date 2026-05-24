output "queue_urls" {
  description = "Map of queue URLs"
  value       = { for k, v in aws_sqs_queue.main : k => v.url }
}

output "queue_arns" {
  description = "Map of queue ARNs"
  value       = { for k, v in aws_sqs_queue.main : k => v.arn }
}

output "dlq_arns" {
  description = "Map of DLQ ARNs"
  value       = { for k, v in aws_sqs_queue.dlq : k => v.arn }
}
