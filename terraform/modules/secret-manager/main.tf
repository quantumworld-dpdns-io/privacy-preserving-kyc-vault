resource "aws_secretsmanager_secret" "main" {
  for_each = var.secrets

  name                    = "${var.name_prefix}/${each.key}"
  description             = lookup(each.value, "description", null)
  kms_key_id              = lookup(each.value, "kms_key_id", null)
  recovery_window_in_days = lookup(each.value, "recovery_window_days", 30)

  dynamic "rotation_rules" {
    for_each = lookup(each.value, "rotation_days", null) != null ? [1] : []
    content {
      automatically_after_days = each.value.rotation_days
    }
  }

  tags = merge({
    Name = "${var.name_prefix}/${each.key}"
  }, lookup(each.value, "tags", {}))
}

resource "aws_secretsmanager_secret_version" "main" {
  for_each = {
    for k, v in var.secrets : k => v if lookup(v, "secret_string", null) != null
  }

  secret_id     = aws_secretsmanager_secret.main[each.key].id
  secret_string = each.value.secret_string
}

resource "aws_secretsmanager_secret_rotation" "main" {
  for_each = {
    for k, v in var.secrets : k => v if lookup(v, "rotation_lambda_arn", null) != null && lookup(v, "rotation_days", null) != null
  }

  secret_id           = aws_secretsmanager_secret.main[each.key].id
  rotation_lambda_arn = each.value.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = each.value.rotation_days
  }
}

resource "aws_secretsmanager_secret_policy" "main" {
  for_each = {
    for k, v in var.secrets : k => v if lookup(v, "resource_policy", null) != null
  }

  secret_arn = aws_secretsmanager_secret.main[each.key].arn
  policy     = each.value.resource_policy
}
