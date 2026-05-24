locals {
  bucket_count = length(var.bucket_configs)
}

resource "aws_kms_key" "s3" {
  count = var.create_kms_key ? 1 : 0

  description             = "KMS key for S3 bucket encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "${var.name_prefix}-s3-kms"
  }
}

resource "aws_s3_bucket" "main" {
  for_each = var.bucket_configs

  bucket = "${var.name_prefix}-${each.key}"

  tags = merge({
    Name = "${var.name_prefix}-${each.key}"
  }, lookup(each.value, "tags", {}))
}

resource "aws_s3_bucket_versioning" "main" {
  for_each = var.bucket_configs

  bucket = aws_s3_bucket.main[each.key].id

  versioning_configuration {
    status = lookup(each.value, "versioning", true) ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  for_each = var.bucket_configs

  bucket = aws_s3_bucket.main[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.create_kms_key ? aws_kms_key.s3[0].arn : lookup(each.value, "kms_key_arn", null)
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "main" {
  for_each = {
    for k, v in var.bucket_configs : k => v if lookup(v, "lifecycle_rules", null) != null
  }

  bucket = aws_s3_bucket.main[each.key].id

  dynamic "rule" {
    for_each = each.value.lifecycle_rules
    content {
      id     = rule.value.id
      status = rule.value.enabled ? "Enabled" : "Disabled"

      dynamic "transition" {
        for_each = lookup(rule.value, "transitions", [])
        content {
          days          = transition.value.days
          storage_class = transition.value.storage_class
        }
      }

      dynamic "expiration" {
        for_each = lookup(rule.value, "expiration", null) != null ? [rule.value.expiration] : []
        content {
          days                         = lookup(expiration.value, "days", null)
          expired_object_delete_marker = lookup(expiration.value, "expired_object_delete_marker", null)
        }
      }

      dynamic "noncurrent_version_expiration" {
        for_each = lookup(rule.value, "noncurrent_version_expiration", null) != null ? [rule.value.noncurrent_version_expiration] : []
        content {
          noncurrent_days = noncurrent_version_expiration.value.days
        }
      }
    }
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  for_each = var.bucket_configs

  bucket = aws_s3_bucket.main[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "enforce_tls" {
  for_each = {
    for k, v in var.bucket_configs : k => v if lookup(v, "enforce_tls", true)
  }

  bucket = aws_s3_bucket.main[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnforceTLS"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.main[each.key].arn,
          "${aws_s3_bucket.main[each.key].arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_logging" "main" {
  for_each = {
    for k, v in var.bucket_configs : k => v if lookup(v, "access_log_bucket", null) != null
  }

  bucket = aws_s3_bucket.main[each.key].id

  target_bucket = each.value.access_log_bucket
  target_prefix = "logs/${var.name_prefix}-${each.key}/"
}
