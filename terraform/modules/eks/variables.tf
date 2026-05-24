variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.29"
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for the EKS cluster"
  type        = list(string)
}

variable "kms_key_arn" {
  description = "ARN of KMS key for secret encryption"
  type        = string
}

variable "endpoint_private_access" {
  description = "Whether to enable private access to the EKS API"
  type        = bool
  default     = true
}

variable "endpoint_public_access" {
  description = "Whether to enable public access to the EKS API"
  type        = bool
  default     = false
}

variable "endpoint_public_access_cidrs" {
  description = "CIDR blocks allowed to access the EKS public endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "cluster_log_types" {
  description = "List of log types to enable for the EKS cluster"
  type        = list(string)
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
}

variable "oidc_thumbprint_list" {
  description = "List of OIDC thumbprints"
  type        = list(string)
  default     = []
}

variable "coredns_version" {
  description = "Version of CoreDNS addon"
  type        = string
  default     = null
}

variable "kube_proxy_version" {
  description = "Version of kube-proxy addon"
  type        = string
  default     = null
}

variable "vpc_cni_version" {
  description = "Version of VPC CNI addon"
  type        = string
  default     = null
}

variable "ebs_csi_version" {
  description = "Version of EBS CSI driver addon"
  type        = string
  default     = null
}

variable "node_groups" {
  description = "Map of node group configurations"
  type = map(object({
    instance_types              = list(string)
    capacity_type              = string
    desired_size               = number
    min_size                   = number
    max_size                   = number
    max_unavailable_percentage = number
    labels                     = map(string)
  }))
  default = {
    general = {
      instance_types              = ["t3.medium"]
      capacity_type              = "ON_DEMAND"
      desired_size               = 2
      min_size                   = 1
      max_size                   = 5
      max_unavailable_percentage = 50
      labels = {
        type = "general"
      }
    }
  }
}
