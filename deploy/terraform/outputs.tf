# Terraform Outputs - KYC Vault
# ============================================================

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "intra_subnet_ids" {
  description = "Intra subnet IDs (no NAT)"
  value       = module.vpc.intra_subnets
}

output "database_subnet_group" {
  description = "Database subnet group name"
  value       = module.vpc.database_subnet_group
}

output "eks_cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_arn" {
  description = "EKS cluster ARN"
  value       = module.eks.cluster_arn
}

output "eks_cluster_certificate_authority" {
  description = "EKS cluster certificate authority data"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_oidc_provider_arn" {
  description = "EKS OIDC provider ARN"
  value       = module.eks.oidc_provider_arn
}

output "eks_oidc_provider_url" {
  description = "EKS OIDC provider URL"
  value       = module.eks.oidc_provider
}

output "db_instance_id" {
  description = "RDS instance identifier"
  value       = module.rds.db_instance_id
}

output "db_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.db_instance_endpoint
  sensitive   = true
}

output "db_port" {
  description = "RDS database port"
  value       = module.rds.db_instance_port
}

output "db_name" {
  description = "RDS database name"
  value       = module.rds.db_instance_name
}

output "db_username" {
  description = "RDS master username"
  value       = module.rds.db_instance_username
  sensitive   = true
}

output "db_password" {
  description = "RDS master password"
  value       = random_password.db_password.result
  sensitive   = true
}

output "redis_replication_group_id" {
  description = "Redis replication group ID"
  value       = module.redis.replication_group_id
}

output "redis_primary_endpoint" {
  description = "Redis primary endpoint"
  value       = module.redis.replication_group_primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint"
  value       = module.redis.replication_group_reader_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = module.redis.replication_group_port
}

output "redis_auth_token" {
  description = "Redis AUTH token"
  value       = random_password.redis_auth.result
  sensitive   = true
}

output "kafka_cluster_arn" {
  description = "MSK cluster ARN"
  value       = module.msk.cluster_arn
}

output "kafka_bootstrap_brokers" {
  description = "Kafka bootstrap broker strings"
  value       = module.msk.bootstrap_brokers_tls
  sensitive   = true
}

output "kafka_zookeeper_connect" {
  description = "Kafka ZooKeeper connect string"
  value       = module.msk.zookeeper_connect_string
  sensitive   = true
}

output "s3_credential_bucket" {
  description = "S3 bucket for credential artifacts"
  value       = aws_s3_bucket.credential_artifacts.id
}

output "s3_iceberg_bucket" {
  description = "S3 bucket for Iceberg data lake"
  value       = aws_s3_bucket.iceberg_data_lake.id
}

output "s3_audit_bucket" {
  description = "S3 bucket for audit logs"
  value       = aws_s3_bucket.audit_logs.id
}

output "waf_acl_arn" {
  description = "WAF web ACL ARN"
  value       = try(aws_wafv2_web_acl.kyc_vault[0].arn, null)
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = aws_acm_certificate.kyc_vault.arn
}

output "route53_zone_id" {
  description = "Route53 hosted zone ID"
  value       = data.aws_route53_zone.main.zone_id
}

output "irsa_role_arns" {
  description = "IRSA role ARNs for service accounts"
  value = {
    for k, v in module.irsa : k => v.iam_role_arn
  }
}
