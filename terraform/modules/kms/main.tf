resource "aws_kms_key" "main" {
  for_each = var.keys

  description             = lookup(each.value, "description", "KMS key for ${each.key}")
  deletion_window_in_days = lookup(each.value, "deletion_window_days", 7)
  enable_key_rotation     = lookup(each.value, "enable_rotation", true)
  is_enabled              = lookup(each.value, "is_enabled", true)
  key_usage               = lookup(each.value, "key_usage", "ENCRYPT_DECRYPT")
  customer_master_key_spec = lookup(each.value, "key_spec", "SYMMETRIC_DEFAULT")
  multi_region            = lookup(each.value, "multi_region", false)
  policy                  = lookup(each.value, "policy", data.aws_iam_policy_document.default[each.key].json)

  tags = merge({
    Name = "${var.name_prefix}-${each.key}"
  }, lookup(each.value, "tags", {}))
}

data "aws_iam_policy_document" "default" {
  for_each = {
    for k, v in var.keys : k => v if lookup(v, "policy", null) == null
  }

  statement {
    sid    = "EnableIAMPermissions"
    effect = "Allow"
    principals {
      type = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "AllowServiceUsage"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = lookup(each.value, "allowed_principals", ["*"])
    }
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = ["*"]
  }
}

data "aws_caller_identity" "current" {}

resource "aws_kms_alias" "main" {
  for_each = var.keys

  name          = "alias/${var.name_prefix}/${each.key}"
  target_key_id = aws_kms_key.main[each.key].key_id
}

resource "aws_kms_grant" "main" {
  for_each = {
    for k, v in var.keys : k => v if lookup(v, "grants", null) != null
  }

  name               = "${var.name_prefix}-${each.key}-grant"
  key_id             = aws_kms_key.main[each.key].key_id
  grantee_principal  = each.value.grants.grantee_principal
  operations         = each.value.grants.operations
  retiring_principal = lookup(each.value.grants, "retiring_principal", null)
}
