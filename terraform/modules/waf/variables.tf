variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "is_regional" {
  description = "Whether this WAF ACL is regional (not CloudFront)"
  type        = bool
  default     = false
}

variable "rate_limit_rules" {
  description = "List of rate limit rule configurations"
  type = list(object({
    name     = string
    priority = number
    limit    = number
  }))
  default = [
    {
      name     = "rate-limit"
      priority = 0
      limit    = 2000
    }
  ]
}

variable "owasp_rules" {
  description = "List of OWASP managed rule group configurations"
  type = list(object({
    name                = string
    priority            = number
    managed_rule_group_name = string
    excluded_rules      = optional(list(string), [])
    rule_action_overrides = optional(list(object({
      name = string
    })), [])
  }))
  default = [
    {
      name                     = "aws-managed-core"
      priority                 = 10
      managed_rule_group_name  = "AWSManagedRulesCommonRuleSet"
      excluded_rules           = []
      rule_action_overrides    = []
    },
    {
      name                     = "aws-managed-sql"
      priority                 = 20
      managed_rule_group_name  = "AWSManagedRulesSQLiRuleSet"
      excluded_rules           = []
      rule_action_overrides    = []
    },
    {
      name                     = "aws-managed-php"
      priority                 = 30
      managed_rule_group_name  = "AWSManagedRulesPHPRuleSet"
      excluded_rules           = []
      rule_action_overrides    = []
    },
    {
      name                     = "aws-managed-lfi"
      priority                 = 40
      managed_rule_group_name  = "AWSManagedRulesLinuxRuleSet"
      excluded_rules           = []
      rule_action_overrides    = []
    },
  ]
}

variable "ip_sets" {
  description = "Map of IP set configurations"
  type = map(object({
    description = optional(string)
    ip_version  = optional(string, "IPV4")
    addresses   = list(string)
  }))
  default = {}
}

variable "ip_set_rules" {
  description = "List of IP set rule configurations"
  type = list(object({
    name       = string
    priority   = number
    ip_set_arn = string
    action     = any
  }))
  default = []
}

variable "custom_rules" {
  description = "List of custom header-matching rule configurations"
  type = list(object({
    name         = string
    priority     = number
    action       = any
    header_name  = string
    match_value  = string
  }))
  default = []
}

variable "associated_resources" {
  description = "Map of resources to associate with the WAF ACL"
  type        = map(string)
  default     = {}
}

variable "log_destination_configs" {
  description = "List of log destination ARNs (CloudWatch, S3, Firehose)"
  type        = list(string)
  default     = []
}
