resource "aws_iam_role" "custom" {
  for_each = var.roles

  name                 = "${var.name_prefix}-${each.key}"
  assume_role_policy   = each.value.assume_role_policy
  description          = lookup(each.value, "description", null)
  max_session_duration = lookup(each.value, "max_session_duration", 3600)
  path                 = lookup(each.value, "path", "/")

  tags = merge({
    Name = "${var.name_prefix}-${each.key}"
  }, lookup(each.value, "tags", {}))
}

resource "aws_iam_policy" "custom" {
  for_each = {
    for k, v in var.roles : k => v if lookup(v, "inline_policies", null) != null
  }

  name        = "${var.name_prefix}-${each.key}-policy"
  description = "Policy for ${var.name_prefix}-${each.key}"
  path        = "/"

  policy = each.value.inline_policies
}

resource "aws_iam_role_policy_attachment" "custom" {
  for_each = {
    for pair in local.role_policy_attachments : "${pair.role}.${pair.policy}" => pair
  }

  role       = aws_iam_role.custom[each.value.role].name
  policy_arn = each.value.policy_arn
}

locals {
  role_policy_attachments = flatten([
    for role_key, role_config in var.roles : [
      for policy_arn in lookup(role_config, "policy_arns", []) : {
        role       = role_key
        policy_arn = policy_arn
      }
    ]
  ])
}

resource "aws_iam_service_linked_role" "custom" {
  for_each = {
    for k, v in var.service_linked_roles : k => v
  }

  aws_service_name = each.value.aws_service_name
  description      = lookup(each.value, "description", null)
}

data "aws_iam_policy_document" "irsa" {
  for_each = var.irsa_roles

  statement {
    effect = "Allow"
    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }
    actions = ["sts:AssumeRoleWithWebIdentity"]
    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_provider_url, "https://", "")}:sub"
      values   = ["system:serviceaccount:${each.value.namespace}:${each.value.service_account}"]
    }
  }
}

resource "aws_iam_role" "irsa" {
  for_each = var.irsa_roles

  name                 = "${var.name_prefix}-irsa-${each.key}"
  assume_role_policy   = data.aws_iam_policy_document.irsa[each.key].json
  max_session_duration = 3600

  tags = {
    Name = "${var.name_prefix}-irsa-${each.key}"
  }
}

resource "aws_iam_role_policy_attachment" "irsa" {
  for_each = {
    for pair in local.irsa_policy_attachments : "${pair.role}.${pair.policy}" => pair
  }

  role       = aws_iam_role.irsa[each.value.role].name
  policy_arn = each.value.policy_arn
}

locals {
  irsa_policy_attachments = flatten([
    for role_key, role_config in var.irsa_roles : [
      for policy_arn in lookup(role_config, "policy_arns", []) : {
        role       = role_key
        policy_arn = policy_arn
      }
    ]
  ])
}
