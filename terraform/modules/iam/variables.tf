variable "role_name" {
  description = "Name of the IAM role"
  type        = string
}

variable "role_description" {
  description = "Description of the IAM role"
  type        = string
  default     = ""
}

variable "assume_role_policy" {
  description = "JSON policy document for assuming the role"
  type        = string
}

variable "attached_policy_arns" {
  description = "List of ARN of IAM policies to attach to the role"
  type        = list(string)
  default     = []
}

variable "inline_policy_names" {
  description = "List of names for inline policies"
  type        = list(string)
  default     = []
}

variable "inline_policies" {
  description = "List of inline policy documents"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to the IAM role"
  type        = map(string)
  default     = {}
}
