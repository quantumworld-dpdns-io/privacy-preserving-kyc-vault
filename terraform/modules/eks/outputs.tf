output "cluster_name" {
  description = "Name of the EKS cluster"
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "Endpoint URL for EKS cluster"
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_security_group_id" {
  description = "Security group ID for the EKS cluster"
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "nodegroup_role_arn" {
  description = "ARN of the node group IAM role"
  value       = aws_iam_role.eks_nodegroup.arn
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate authority data required to communicate with EKS"
  value       = aws_eks_cluster.this.certificate_authority[0].data
}
