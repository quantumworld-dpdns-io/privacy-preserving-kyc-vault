variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "List of security group IDs allowed to connect"
  type        = list(string)
  default     = []
}

variable "node_type" {
  description = "ElastiCache node instance type"
  type        = string
  default     = "cache.t3.medium"
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.1"
}

variable "parameter_group_name" {
  description = "Parameter group name"
  type        = string
  default     = "default.redis7"
}

variable "automatic_failover_enabled" {
  description = "Whether to enable automatic failover"
  type        = bool
  default     = true
}

variable "multi_az_enabled" {
  description = "Whether to enable Multi-AZ"
  type        = bool
  default     = false
}

variable "num_cache_clusters" {
  description = "Number of cache clusters (node groups can't be set if this is set)"
  type        = number
  default     = 2
}

variable "num_node_groups" {
  description = "Number of shards for cluster mode"
  type        = number
  default     = null
}

variable "replicas_per_node_group" {
  description = "Replicas per shard"
  type        = number
  default     = null
}

variable "auth_token" {
  description = "Auth token for Redis (transit encryption)"
  type        = string
  sensitive   = true
  default     = null
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption at rest"
  type        = string
  default     = null
}

variable "auto_minor_version_upgrade" {
  description = "Whether to auto-upgrade minor versions"
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "Whether changes should be applied immediately"
  type        = bool
  default     = false
}

variable "maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "sun:06:00-sun:07:00"
}

variable "snapshot_window" {
  description = "Daily snapshot window"
  type        = string
  default     = "04:00-05:00"
}

variable "snapshot_retention_limit" {
  description = "Snapshot retention limit in days"
  type        = number
  default     = 7
}
