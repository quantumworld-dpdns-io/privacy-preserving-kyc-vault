variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for MSK brokers"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "List of security group IDs allowed to connect"
  type        = list(string)
  default     = []
}

variable "kafka_version" {
  description = "Kafka version"
  type        = string
  default     = "3.6.0"
}

variable "number_of_broker_nodes" {
  description = "Number of broker nodes"
  type        = number
  default     = 3
}

variable "broker_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.t3.small"
}

variable "broker_volume_size" {
  description = "Volume size per broker in GB"
  type        = number
  default     = 100
}

variable "client_broker_encryption" {
  description = "Encryption in transit setting"
  type        = string
  default     = "TLS"
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption at rest"
  type        = string
  default     = null
}

variable "unauthenticated_access" {
  description = "Whether to allow unauthenticated access"
  type        = bool
  default     = false
}

variable "iam_auth_enabled" {
  description = "Whether to enable IAM SASL authentication"
  type        = bool
  default     = true
}

variable "scram_auth_enabled" {
  description = "Whether to enable SCRAM SASL authentication"
  type        = bool
  default     = false
}

variable "auto_create_topics" {
  description = "Whether to auto-create topics"
  type        = bool
  default     = false
}

variable "default_replication_factor" {
  description = "Default replication factor"
  type        = number
  default     = 3
}

variable "min_insync_replicas" {
  description = "Minimum in-sync replicas"
  type        = number
  default     = 2
}

variable "cloudwatch_logs_enabled" {
  description = "Whether to enable CloudWatch logs"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Retention days for MSK broker logs"
  type        = number
  default     = 30
}
