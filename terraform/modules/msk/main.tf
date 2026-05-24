resource "aws_security_group" "msk" {
  name_prefix = "${var.name_prefix}-msk-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 9092
    to_port         = 9094
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  ingress {
    from_port       = 2181
    to_port         = 2181
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
    Name = "${var.name_prefix}-msk-sg"
  }
}

resource "aws_msk_cluster" "main" {
  cluster_name  = "${var.name_prefix}-msk"
  kafka_version = var.kafka_version
  number_of_broker_nodes = var.number_of_broker_nodes

  broker_node_group_info {
    instance_type       = var.broker_instance_type
    client_subnets      = var.subnet_ids
    security_groups     = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.broker_volume_size
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = var.client_broker_encryption
      in_cluster    = true
    }
    encryption_at_rest_kms_key_arn = var.kms_key_arn
  }

  client_authentication {
    unauthenticated = var.unauthenticated_access
    sasl {
      iam   = var.iam_auth_enabled
      scram = var.scram_auth_enabled
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = var.cloudwatch_logs_enabled
        log_group = var.cloudwatch_logs_enabled ? aws_cloudwatch_log_group.msk[0].name : null
      }
    }
  }

  tags = {
    Name = "${var.name_prefix}-msk"
  }
}

resource "aws_msk_configuration" "main" {
  name = "${var.name_prefix}-msk-config"
  kafka_versions = [var.kafka_version]

  server_properties = <<-EOF
auto.create.topics.enable = ${var.auto_create_topics}
default.replication.factor = ${var.default_replication_factor}
min.insync.replicas = ${var.min_insync_replicas}
num.io.threads = 8
num.network.threads = 8
EOF
}

resource "aws_cloudwatch_log_group" "msk" {
  count = var.cloudwatch_logs_enabled ? 1 : 0

  name              = "/aws/msk/${var.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.name_prefix}-msk-logs"
  }
}
