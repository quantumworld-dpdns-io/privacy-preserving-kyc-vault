# Terraform Variables - KYC Vault
# ============================================================
# All configurable variables for the KYC Vault infrastructure

variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production"
  }
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Domain name for the KYC Vault API"
  type        = string
  default     = "kyc-vault.com"
}

# ============================================================
# VPC Variables
# ============================================================
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "intra_subnet_cidrs" {
  description = "CIDR blocks for intra-subnets (no NAT)"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

# ============================================================
# EKS Variables
# ============================================================
variable "service_node_desired" {
  description = "Desired number of service nodes"
  type        = number
  default     = 3
}

variable "service_node_min" {
  description = "Minimum number of service nodes"
  type        = number
  default     = 3
}

variable "service_node_max" {
  description = "Maximum number of service nodes"
  type        = number
  default     = 10
}

variable "service_instance_types" {
  description = "Instance types for service nodes"
  type        = list(string)
  default     = ["m7i.large", "m7i.xlarge"]
}

variable "ai_node_desired" {
  description = "Desired number of AI inference nodes"
  type        = number
  default     = 1
}

variable "ai_node_min" {
  description = "Minimum number of AI inference nodes"
  type        = number
  default     = 1
}

variable "ai_node_max" {
  description = "Maximum number of AI inference nodes"
  type        = number
  default     = 5
}

variable "ai_instance_types" {
  description = "Instance types for AI inference nodes (GPU)"
  type        = list(string)
  default     = ["g5.xlarge", "g5.2xlarge"]
}

# ============================================================
# RDS Variables
# ============================================================
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r7g.large"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS in GB"
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum autoscaling storage for RDS in GB"
  type        = number
  default     = 1000
}

# ============================================================
# Redis Variables
# ============================================================
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r7g.large"
}

# ============================================================
# MSK Kafka Variables
# ============================================================
variable "kafka_broker_count" {
  description = "Number of MSK Kafka brokers"
  type        = number
  default     = 3
}

variable "kafka_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.m7i.large"
}

variable "kafka_volume_size" {
  description = "MSK broker volume size in GB"
  type        = number
  default     = 500
}

# ============================================================
# IAM Variables
# ============================================================
variable "irsa_services" {
  description = "List of service accounts to create IRSA roles for"
  type        = list(string)
  default     = [
    "kyc-orchestrator",
    "kyc-credential-service",
    "kyc-ai-inference",
    "kyc-zkp-engine",
    "kyc-webhook-relay",
  ]
}
