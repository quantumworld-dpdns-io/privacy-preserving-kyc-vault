variable "name_prefix" {
  description = "Prefix for IAM role names"
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the OIDC provider for IRSA"
  type        = string
  default     = null
}

variable "oidc_provider_url" {
  description = "URL of the OIDC provider (issuer URL)"
  type        = string
  default     = null
}

variable "roles" {
  description = "Map of IAM role configurations"
  type = map(object({
    assume_role_policy   = string
    description          = optional(string)
    max_session_duration = optional(number, 3600)
    path                 = optional(string, "/")
    policy_arns          = optional(list(string), [])
    inline_policies      = optional(string)
    tags                 = optional(map(string))
  }))
  default = {}
}

variable "irsa_roles" {
  description = "Map of IRSA role configurations"
  type = map(object({
    namespace       = string
    service_account = string
    policy_arns     = list(string)
  }))
  default = {}
}

variable "service_linked_roles" {
  description = "Map of service-linked role configurations"
  type = map(object({
    aws_service_name = string
    description      = optional(string)
  }))
  default = {}
}
