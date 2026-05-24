resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.name_prefix}-redis-subnet-group"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.name_prefix}-redis-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-redis-sg"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id          = "${var.name_prefix}-redis"
  description                   = "Redis cluster for ${var.name_prefix}"
  node_type                     = var.node_type
  port                          = 6379
  parameter_group_name          = var.parameter_group_name
  automatic_failover_enabled    = var.automatic_failover_enabled
  multi_az_enabled              = var.multi_az_enabled
  num_cache_clusters            = var.num_cache_clusters
  num_node_groups               = var.num_node_groups
  replicas_per_node_group       = var.replicas_per_node_group
  subnet_group_name             = aws_elasticache_subnet_group.main.name
  security_group_ids            = [aws_security_group.redis.id]
  engine                        = "redis"
  engine_version                = var.engine_version
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  auth_token                    = var.auth_token
  kms_key_id                    = var.kms_key_arn
  auto_minor_version_upgrade    = var.auto_minor_version_upgrade
  apply_immediately             = var.apply_immediately
  maintenance_window            = var.maintenance_window
  snapshot_window               = var.snapshot_window
  snapshot_retention_limit      = var.snapshot_retention_limit
  final_snapshot_identifier     = "${var.name_prefix}-redis-final"

  tags = {
    Name = "${var.name_prefix}-redis"
  }
}
