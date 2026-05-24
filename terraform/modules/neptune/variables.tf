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

variable "engine_version" {
  description = "Neptune engine version"
  type        = string
  default     = "1.3.0.0"
}

variable "instance_class" {
  description = "Neptune instance class"
  type        = string
  default     = "db.r5.large"
}

variable "instance_count" {
  description = "Number of Neptune instances in the cluster"
  type        = number
  default     = 2
}

variable "backup_retention_days" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
}

variable "backup_window" {
  description = "Preferred backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Preferred maintenance window"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "skip_final_snapshot" {
  description = "Whether to skip final snapshot on deletion"
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption at rest"
  type        = string
  default     = null
}

variable "parameter_group_family" {
  description = "Neptune parameter group family"
  type        = string
  default     = "neptune1"
}

variable "cluster_parameters" {
  description = "List of Neptune cluster parameters"
  type = list(object({
    name         = string
    value        = string
    apply_method = optional(string, "immediate")
  }))
  default = []
}
