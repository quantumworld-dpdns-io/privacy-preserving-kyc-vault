resource "aws_neptune_subnet_group" "main" {
  name       = "${var.name_prefix}-neptune-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.name_prefix}-neptune-subnet-group"
  }
}

resource "aws_security_group" "neptune" {
  name_prefix = "${var.name_prefix}-neptune-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 8182
    to_port         = 8182
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
    Name = "${var.name_prefix}-neptune-sg"
  }
}

resource "aws_neptune_cluster" "main" {
  cluster_identifier                  = "${var.name_prefix}-neptune"
  engine                              = "neptune"
  engine_version                      = var.engine_version
  port                                = 8182
  backup_retention_period             = var.backup_retention_days
  preferred_backup_window             = var.backup_window
  preferred_maintenance_window        = var.maintenance_window
  skip_final_snapshot                 = var.skip_final_snapshot
  final_snapshot_identifier           = var.skip_final_snapshot ? null : "${var.name_prefix}-neptune-final"
  deletion_protection                 = var.deletion_protection
  storage_encrypted                   = true
  kms_key_arn                         = var.kms_key_arn
  iam_database_authentication_enabled = true
  enable_cloudwatch_logs_exports      = ["audit"]

  neptune_cluster_parameter_group_name = aws_neptune_cluster_parameter_group.main.name

  tags = {
    Name = "${var.name_prefix}-neptune"
  }
}

resource "aws_neptune_cluster_instance" "main" {
  count              = var.instance_count
  cluster_identifier = aws_neptune_cluster.main.id
  instance_class     = var.instance_class
  engine_version     = var.engine_version
  identifier         = "${var.name_prefix}-neptune-${count.index}"

  neptune_subnet_group_name = aws_neptune_subnet_group.main.name
  neptune_parameter_group_name = aws_neptune_cluster_parameter_group.main.name

  tags = {
    Name = "${var.name_prefix}-neptune-${count.index}"
  }
}

resource "aws_neptune_cluster_parameter_group" "main" {
  name_prefix = "${var.name_prefix}-neptune-pg-"
  family      = var.parameter_group_family
  description = "Parameter group for ${var.name_prefix} Neptune cluster"

  dynamic "parameter" {
    for_each = var.cluster_parameters
    content {
      name         = parameter.value.name
      value        = parameter.value.value
      apply_method = lookup(parameter.value, "apply_method", "immediate")
    }
  }

  tags = {
    Name = "${var.name_prefix}-neptune-pg"
  }
}
