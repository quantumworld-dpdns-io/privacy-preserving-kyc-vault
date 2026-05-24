variable "name_prefix" {
  description = "Prefix for KMS key aliases"
  type        = string
}

variable "keys" {
  description = "Map of KMS key configurations"
  type = map(object({
    description          = optional(string)
    deletion_window_days = optional(number, 7)
    enable_rotation      = optional(bool, true)
    is_enabled           = optional(bool, true)
    key_usage            = optional(string, "ENCRYPT_DECRYPT")
    key_spec             = optional(string, "SYMMETRIC_DEFAULT")
    multi_region         = optional(bool, false)
    policy               = optional(string)
    allowed_principals   = optional(list(string))
    grants = optional(object({
      grantee_principal  = string
      operations         = list(string)
      retiring_principal = optional(string)
    }))
    tags = optional(map(string))
  }))
}
