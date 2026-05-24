# SQS Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "name" {
  description = "Name of the SQS queue"
  type        = string
}

variable "fifo_queue" {
  description = "Whether this is a FIFO queue"
  type        = bool
  default     = false
}

variable "content_based_deduplication" {
  description = "Enables content-based deduplication for FIFO queues"
  type        = bool
  default     = false
}

variable "delay_seconds" {
  description = "Delay in seconds for message delivery"
  type        = number
  default     = 0
}

variable "max_message_size" {
  description = "Maximum message size in bytes"
  type        = number
  default     = 262144
}

variable "message_retention_seconds" {
  description = "Message retention period in seconds"
  type        = number
  default     = 345600  # 4 days
}

variable "receive_wait_time_seconds" {
  description = "Receive wait time in seconds"
  type        = number
  default     = 0
}

variable "redrive_policy" {
  description = "Redrive policy for dead letter queue"
  type        = string
  default     = ""
}

variable "kms_master_key_id" {
  description = "KMS key ID for encryption"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to the queue"
  type        = map(string)
  default     = {}
}

# Main Queue
resource "aws_sqs_queue" "this" {
  name                      = var.fifo_queue ? "${var.name}.fifo" : var.name
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = var.delay_seconds
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  redrive_policy            = var.redrive_policy != "" ? var.redrive_policy : null
  kms_master_key_id         = var.kms_master_key_id != "" ? var.kms_master_key_id : null
  tags                      = var.tags
}

# Dead Letter Queue (if redrive policy is not set, we assume we want to create one for demonstration)
# In practice, the redrive policy would reference an existing queue. Here we create one if redrive_policy is not set.
resource "aws_sqs_queue" "dead_letter" {
  count = var.redrive_policy == "" ? 1 : 0
  name                      = "${var.name}-dead-letter"
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = 0
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  tags                      = var.tags
}

# Override the main queue's redrive policy if we created a DLQ
resource "aws_sqs_queue" "this" {
  count = var.redrive_policy == "" ? 0 : 1
  name                      = var.fifo_queue ? "${var.name}.fifo" : var.name
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = var.delay_seconds
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  redrive_policy            = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[0].arn
    maxReceiveCount     = 3
  })
  kms_master_key_id         = var.kms_master_key_id != "" ? var.kms_master_key_id : null
  tags                      = var.tags
}

# If redrive_policy is set, we assume the user will manage the DLQ externally, so we don't create one.
# But we still need to output the main queue ARN for reference.
# We'll handle this by having two resources and using count to conditionally create.

# Actually, let's simplify: we'll always create the main queue, and if redrive_policy is not set, we create a DLQ and attach it.
# If redrive_policy is set, we assume it's a valid JSON string and use it as is.

# We'll create the main queue unconditionally, and conditionally create the DLQ and update the main queue's redrive policy.

resource "aws_sqs_queue" "main" {
  name                      = var.fifo_queue ? "${var.name}.fifo" : var.name
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = var.delay_seconds
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  kms_master_key_id         = var.kms_master_key_id != "" ? var.kms_master_key_id : null
  tags                      = var.tags
}

resource "aws_sqs_queue" "dead_letter" {
  count = var.redrive_policy == "" ? 1 : 0
  name                      = "${var.name}-dead-letter"
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = 0
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  tags                      = var.tags
}

# Update the main queue's redrive policy if we created a DLQ
resource "aws_sqs_queue" "main_with_dlq" {
  count = var.redrive_policy == "" ? 1 : 0
  name                      = var.fifo_queue ? "${var.name}.fifo" : var.name
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = var.delay_seconds
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  redrive_policy            = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[0].arn
    maxReceiveCount     = 3
  })
  kms_master_key_id         = var.kms_master_key_id != "" ? var.kms_master_key_id : null
  tags                      = var.tags
}

# If redrive_policy is set, we use the main queue as is, but we need to set the redrive policy from the variable.
# We'll create another resource for that case.
resource "aws_sqs_queue" "main_with_policy" {
  count = var.redrive_policy == "" ? 0 : 1
  name                      = var.fifo_queue ? "${var.name}.fifo" : var.name
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = var.delay_seconds
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  redrive_policy            = var.redrive_policy
  kms_master_key_id         = var.kms_master_key_id != "" ? var.kms_master_key_id : null
  tags                      = var.tags
}

# We need to output the queue ARN. We'll use a dynamic approach or just output from the main resource.
# Let's instead use a single resource and conditionally set the redrive policy.

# Let's redo the SQS module more cleanly.

# We'll create one queue resource and conditionally set the redrive_policy and also conditionally create a DLQ.

# However, Terraform doesn't allow conditional creation of resources in a way that we can reference in the same module cleanly without complexity.
# Instead, we'll create the main queue and then optionally create a DLQ and then optionally update the main queue's redrive policy.

# But note: we cannot update a resource after creation in Terraform without replacing it unless we use lifecycle or separate resources.

# Given the complexity, let's create two separate examples: one without DLQ and one with DLQ as separate modules? 
# But the user asked for a module that can do both.

# We'll do: if redrive_policy is set, we use it. If not, we create a DLQ and set the redrive policy to point to it.

# We can achieve this by:
# 1. Always create the main queue.
# 2. Conditionality create a DLQ.
# 3. Use a dynamic redrive_policy on the main queue that is either the variable or the one constructed from the DLQ.

# However, we cannot reference the DLQ in the redrive_policy of the same queue if we are creating it conditionally because of dependency cycles.

# Instead, we'll create the DLQ first (if needed) and then the main queue that references it.

# Let's restructure:

# Resource "aws_sqs_queue" "dead_letter" {
#   count = var.redrive_policy == "" ? 1 : 0
#   ...
# }

# Resource "aws_sqs_queue" "main" {
#   name                      = var.fifo_queue ? "${var.name}.fifo" : var.name
#   ... 
#   redrive_policy            = var.redrive_policy != "" ? var.redrive_policy : (length(aws_sqs_queue.dead_letter) > 0 ? jsonencode({ deadLetterTargetArn = aws_sqs_queue.dead_letter[0].arn, maxReceiveCount = 3 }) : null)
#   ...
# }

# This should work because the dead_letter queue is created with count 0 or 1, and we can reference it.

# Let's write it that way.

resource "aws_sqs_queue" "dead_letter" {
  count = var.redrive_policy == "" ? 1 : 0
  name                      = "${var.name}-dead-letter"
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = 0
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  tags                      = var.tags
}

resource "aws_sqs_queue" "main" {
  name                      = var.fifo_queue ? "${var.name}.fifo" : var.name
  fifo_queue                = var.fifo_queue
  content_based_deduplication = var.content_based_deduplication
  delay_seconds             = var.delay_seconds
  max_message_size          = var.max_message_size
  message_retention_seconds = var.message_retention_seconds
  receive_wait_time_seconds = var.receive_wait_time_seconds
  redrive_policy            = var.redrive_policy != "" ? var.redrive_policy : (length(aws_sqs_queue.dead_letter) > 0 ? jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[0].arn
    maxReceiveCount     = 3
  }) : null)
  kms_master_key_id         = var.kms_master_key_id != "" ? var.kms_master_key_id : null
  tags                      = var.tags
}

output "queue_url" {
  description = "The URL of the SQS queue"
  value       = aws_sqs_queue.main[0].url
}

output "queue_arn" {
  description = "The ARN of the SQS queue"
  value       = aws_sqs_queue.main[0].arn
}

output "dead_letter_queue_arn" {
  description = "The ARN of the dead letter queue (if created)"
  value       = length(aws_sqs_queue.dead_letter) > 0 ? aws_sqs_queue.dead_letter[0].arn : null
}
