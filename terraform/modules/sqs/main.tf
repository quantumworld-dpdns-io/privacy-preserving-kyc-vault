resource "aws_sqs_queue" "dlq" {
  for_each = var.queues

  name                      = "${var.name_prefix}-${each.key}-dlq"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = lookup(each.value, "dlq_retention_days", 14) * 86400
  receive_wait_time_seconds = 20

  kms_master_key_id                 = lookup(each.value, "kms_key_id", null)
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name = "${var.name_prefix}-${each.key}-dlq"
  }
}

resource "aws_sqs_queue" "main" {
  for_each = var.queues

  name                      = "${var.name_prefix}-${each.key}"
  delay_seconds             = lookup(each.value, "delay_seconds", 0)
  max_message_size          = lookup(each.value, "max_message_size", 262144)
  message_retention_seconds = lookup(each.value, "message_retention_days", 4) * 86400
  receive_wait_time_seconds = lookup(each.value, "receive_wait_time_seconds", 20)
  visibility_timeout_seconds = lookup(each.value, "visibility_timeout_seconds", 30)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = lookup(each.value, "max_receive_count", 5)
  })

  kms_master_key_id                 = lookup(each.value, "kms_key_id", null)
  kms_data_key_reuse_period_seconds = 300

  tags = merge({
    Name = "${var.name_prefix}-${each.key}"
  }, lookup(each.value, "tags", {}))
}

resource "aws_sqs_queue_policy" "main" {
  for_each = {
    for k, v in var.queues : k => v if lookup(v, "policy", null) != null
  }

  queue_url = aws_sqs_queue.main[each.key].id
  policy    = each.value.policy
}
