resource "aws_sns_topic" "main" {
  for_each = var.topics

  name                        = "${var.name_prefix}-${each.key}"
  display_name                = lookup(each.value, "display_name", null)
  kms_master_key_id           = lookup(each.value, "kms_key_id", null)
  fifo_topic                  = lookup(each.value, "fifo_topic", false)
  content_based_deduplication = lookup(each.value, "content_based_deduplication", false)

  tags = merge({
    Name = "${var.name_prefix}-${each.key}"
  }, lookup(each.value, "tags", {}))
}

resource "aws_sns_topic_policy" "main" {
  for_each = {
    for k, v in var.topics : k => v if lookup(v, "policy", null) != null
  }

  arn    = aws_sns_topic.main[each.key].arn
  policy = each.value.policy
}

resource "aws_sns_topic_subscription" "main" {
  for_each = {
    for pair in local.subscriptions : "${pair.topic_key}.${pair.subscription_key}" => pair
  }

  topic_arn            = aws_sns_topic.main[each.value.topic_key].arn
  protocol             = each.value.protocol
  endpoint             = each.value.endpoint
  endpoint_auto_confirms = lookup(each.value, "endpoint_auto_confirms", false)
  raw_message_delivery   = lookup(each.value, "raw_message_delivery", false)
  filter_policy          = lookup(each.value, "filter_policy", null)
}

locals {
  subscriptions = flatten([
    for topic_key, topic_config in var.topics : [
      for sub_key, sub in lookup(topic_config, "subscriptions", {}) : {
        topic_key             = topic_key
        subscription_key      = sub_key
        protocol              = sub.protocol
        endpoint              = sub.endpoint
        endpoint_auto_confirms = lookup(sub, "endpoint_auto_confirms", false)
        raw_message_delivery   = lookup(sub, "raw_message_delivery", false)
        filter_policy          = lookup(sub, "filter_policy", null)
      }
    ]
  ])
}
