locals {
  scope = var.is_regional ? "REGIONAL" : "CLOUDFRONT"
}

resource "aws_wafv2_web_acl" "main" {
  name        = "${var.name_prefix}-waf"
  description = "WAF ACL for ${var.name_prefix}"
  scope       = local.scope

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = var.rate_limit_rules
    content {
      name     = rule.value.name
      priority = rule.value.priority

      action {
        block {}
      }

      statement {
        rate_based_statement {
          limit              = rule.value.limit
          aggregate_key_type = "IP"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name               = "${rule.value.name}-metric"
        sampled_requests_enabled  = true
      }
    }
  }

  dynamic "rule" {
    for_each = var.owasp_rules
    content {
      name     = rule.value.name
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = rule.value.managed_rule_group_name
          vendor_name = "AWS"

          dynamic "rule_action_override" {
            for_each = lookup(rule.value, "rule_action_overrides", [])
            content {
              name = rule_action_override.value.name
              action_to_use {
                count {}
              }
            }
          }

          dynamic "excluded_rule" {
            for_each = lookup(rule.value, "excluded_rules", [])
            content {
              name = excluded_rule.value
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name               = "${rule.value.name}-metric"
        sampled_requests_enabled  = true
      }
    }
  }

  dynamic "rule" {
    for_each = var.ip_set_rules
    content {
      name     = rule.value.name
      priority = rule.value.priority

      action = rule.value.action

      statement {
        ip_set_reference_statement {
          arn = rule.value.ip_set_arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name               = "${rule.value.name}-metric"
        sampled_requests_enabled  = true
      }
    }
  }

  dynamic "rule" {
    for_each = var.custom_rules
    content {
      name     = rule.value.name
      priority = rule.value.priority

      action = rule.value.action

      statement {
        byte_match_statement {
          field_to_match {
            single_header {
              name = rule.value.header_name
            }
          }
          positional_constraint = "EXACTLY"
          search_string         = rule.value.match_value
          text_transformation {
            priority = 0
            type     = "NONE"
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name               = "${rule.value.name}-metric"
        sampled_requests_enabled  = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${var.name_prefix}-waf-metric"
    sampled_requests_enabled  = true
  }

  tags = {
    Name = "${var.name_prefix}-waf"
  }
}

resource "aws_wafv2_ip_set" "main" {
  for_each = var.ip_sets

  name               = "${var.name_prefix}-ipset-${each.key}"
  description        = lookup(each.value, "description", "IP set for ${each.key}")
  scope              = local.scope
  ip_address_version = lookup(each.value, "ip_version", "IPV4")
  addresses          = each.value.addresses

  tags = {
    Name = "${var.name_prefix}-ipset-${each.key}"
  }
}

resource "aws_wafv2_web_acl_association" "main" {
  for_each = var.associated_resources

  resource_arn = each.value
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = var.log_destination_configs
  resource_arn            = aws_wafv2_web_acl.main.arn
}
