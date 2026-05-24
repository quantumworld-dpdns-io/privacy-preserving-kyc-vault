resource "aws_ecr_repository" "main" {
  for_each = var.repositories

  name                 = "${var.name_prefix}/${each.key}"
  image_tag_mutability = lookup(each.value, "image_tag_mutability", "MUTABLE")

  image_scanning_configuration {
    scan_on_push = lookup(each.value, "scan_on_push", true)
  }

  encryption_configuration {
    encryption_type = lookup(each.value, "encryption_type", "AES256")
    kms_key         = lookup(each.value, "kms_key_arn", null)
  }

  tags = merge({
    Name = "${var.name_prefix}/${each.key}"
  }, lookup(each.value, "tags", {}))
}

resource "aws_ecr_lifecycle_policy" "main" {
  for_each = {
    for k, v in var.repositories : k => v if lookup(v, "lifecycle_policy", null) != null
  }

  repository = aws_ecr_repository.main[each.key].name
  policy     = each.value.lifecycle_policy
}

resource "aws_ecr_repository_policy" "main" {
  for_each = {
    for k, v in var.repositories : k => v if lookup(v, "policy", null) != null
  }

  repository = aws_ecr_repository.main[each.key].name
  policy     = each.value.policy
}
