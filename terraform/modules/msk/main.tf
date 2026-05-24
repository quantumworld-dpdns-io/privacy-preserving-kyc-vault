# MSK (Amazon Managed Streaming for Kafka) Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "cluster_name" {
  description = "Name of the MSK cluster"
  type        = string
}

variable "kafka_version" {
  description = "Kafka version"
  type        = string
  default     = "2.8.1"
}

variable "number_of_broker_nodes" {
  description = "Number of broker nodes"
  type        = number
  default     = 3
}

variable "instance_type" {
  description = "Broker node instance type"
  type        = string
  default     = "kafka.m5.large"
}

variable "client_subnets" {
  description = "List of client subnet IDs"
  type        = list(string)
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "security_group_ids" {
  description = "List of security group IDs for MSK brokers"
  type        = list(string)
}

variable "zookeeper_connect_string" {
  description = "Zookeeper connect string (if external, else MSK manages)"
  type        = string
  default     = ""
}

variable "open_monitoring_enabled" {
  description = "Whether to enable open monitoring with Prometheus"
  type        = bool
  default     = false
}

variable "logging_info" {
  description = "Logging info for MSK cluster"
  type        = any
  default     = null
}

# MSK Cluster
resource "aws_msk_cluster" "this" {
  cluster_name           = var.cluster_name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.number_of_broker_nodes

  broker_node_group_info {
    instance_type = var.instance_type
    client_subnets  = var.client_subnets
    security_groups = var.security_group_ids
    storage_info {
      ebs_storage_info {
        volume_size = 1000
      }
    }
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = data.aws_kms_key.default.arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  # If open monitoring is enabled, add Prometheus configuration
  dynamic "open_monitoring" {
    for_each = var.open_monitoring_enabled ? [1] : []
    content {
      prometheus {
        jmx_exporter {
          enabled_in_broker = true
        }
        node_exporter {
          enabled_in_broker = true
        }
      }
    }
  }

  # Logging configuration
  dynamic "logging_info" {
    for_each = var.logging_info != null ? [var.logging_info] : []
    content {
      # This is a placeholder for logging configuration
      # In practice, you would define CloudWatch log groups etc.
    }
  }

  depends_on = [
    aws_iam_role.msk_cluster_role,
    aws_iam_role_policy_attachment.AmazonMSKFullAccess
  ]
}

# IAM Role for MSK Cluster
resource "aws_iam_role" "msk_cluster_role" {
  name = "${var.cluster_name}-msk-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "kafka.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "AmazonMSKFullAccess" {
  role       = aws_iam_role.msk_cluster_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonMSKFullAccess"
}

# Default KMS Key for encryption at rest
resource "aws_kms_key" "default" {
  description             = "KMS key for MSK cluster encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "${var.cluster_name}-msk-key"
  }
}

output "cluster_arn" {
  description = "Amazon Resource Name (ARN) of MSK cluster"
  value       = aws_msk_cluster.this.arn
}

output "cluster_name" {
  description = "Name of the MSK cluster"
  value       = aws_msk_cluster.this.cluster_name
}

output "bootstrap_brokers" {
  description = "Bootstrap brokers string"
  value       = aws_msk_cluster.this.bootstrap_brokers
}

output "bootstrap_brokers_tls" {
  description = "Bootstrap brokers string with TLS"
  value       = aws_msk_cluster.this.bootstrap_brokers_tls
}

output "zookeeper_connect_string" {
  description = "Zookeeper connect string"
  value       = aws_msk_cluster.this.zookeeper_connect_string
}
