variable "name_prefix" {
  description = "Prefix for bucket names"
  type        = string
}

variable "create_kms_key" {
  description = "Whether to create a KMS key for S3 encryption"
  type        = bool
  default     = true
}

variable "bucket_configs" {
  description = "Map of bucket configurations"
  type = map(object({
    versioning     = optional(bool, true)
    kms_key_arn    = optional(string)
    enforce_tls    = optional(bool, true)
    access_log_bucket = optional(string)
    lifecycle_rules = optional(list(object({
      id      = string
      enabled = bool
      transitions = optional(list(object({
        days          = number
        storage_class = string
      })), [])
      expiration = optional(object({
        days                         = optional(number)
        expired_object_delete_marker = optional(bool)
      }))
      noncurrent_version_expiration = optional(object({
        days = number
      }))
    })))
    tags = optional(map(string))
  }))
}
