variable "name_prefix" {
  description = "Prefix for queue names"
  type        = string
}

variable "queues" {
  description = "Map of SQS queue configurations"
  type = map(object({
    delay_seconds               = optional(number, 0)
    max_message_size            = optional(number, 262144)
    message_retention_days      = optional(number, 4)
    receive_wait_time_seconds   = optional(number, 20)
    visibility_timeout_seconds  = optional(number, 30)
    max_receive_count           = optional(number, 5)
    dlq_retention_days          = optional(number, 14)
    kms_key_id                  = optional(string)
    policy                      = optional(string)
    fifo_queue                  = optional(bool, false)
    content_based_deduplication = optional(bool, false)
    tags                        = optional(map(string))
  }))
}
