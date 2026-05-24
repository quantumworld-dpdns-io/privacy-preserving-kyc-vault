variable "name_prefix" {
  description = "Prefix for ECR repository names"
  type        = string
}

variable "repositories" {
  description = "Map of ECR repository configurations"
  type = map(object({
    image_tag_mutability = optional(string, "MUTABLE")
    scan_on_push         = optional(bool, true)
    encryption_type      = optional(string, "AES256")
    kms_key_arn          = optional(string)
    lifecycle_policy     = optional(string)
    policy               = optional(string)
    tags                 = optional(map(string))
  }))
}
