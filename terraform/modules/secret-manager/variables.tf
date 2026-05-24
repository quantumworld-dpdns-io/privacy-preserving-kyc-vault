variable "name_prefix" {
  description = "Prefix for secret names"
  type        = string
}

variable "secrets" {
  description = "Map of secret configurations"
  type = map(object({
    description         = optional(string)
    kms_key_id          = optional(string)
    recovery_window_days = optional(number, 30)
    secret_string       = optional(string, sensitive)
    rotation_lambda_arn = optional(string)
    rotation_days       = optional(number)
    resource_policy     = optional(string)
    tags                = optional(map(string))
  }))
}
