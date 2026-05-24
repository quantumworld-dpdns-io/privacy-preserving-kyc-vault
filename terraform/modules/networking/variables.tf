variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to use"
  type        = number
  default     = 3
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "single_nat_gateway" {
  description = "Whether to use a single NAT gateway for all AZs"
  type        = bool
  default     = false
}

variable "flow_log_retention_days" {
  description = "Retention days for VPC flow logs"
  type        = number
  default     = 30
}
