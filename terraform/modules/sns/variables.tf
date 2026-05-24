variable "name_prefix" {
  description = "Prefix for topic names"
  type        = string
}

variable "topics" {
  description = "Map of SNS topic configurations"
  type = map(object({
    display_name                = optional(string)
    kms_key_id                  = optional(string)
    fifo_topic                  = optional(bool, false)
    content_based_deduplication = optional(bool, false)
    policy                      = optional(string)
    tags                        = optional(map(string))
    subscriptions = optional(map(object({
      protocol              = string
      endpoint              = string
      endpoint_auto_confirms = optional(bool, false)
      raw_message_delivery   = optional(bool, false)
      filter_policy          = optional(string)
    })), {})
  }))
}
